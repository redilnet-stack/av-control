import { useEffect, useState, useRef } from 'react';

// ── Dynamic script loading (Embedded / Component View SDK) ──────
// The Embedded View UMD exposes window.ReactWidgets.createClient()
// globally. We avoid the npm package because it has React 18 peer
// deps that conflict with our React 19.
//
// The UMD bundle still requires React 18 UMD as globals (window.React,
// window.ReactDOM) for its internal rendering. We load those before
// the SDK. Our own app uses React 19 via ESM imports — no conflict.

const REACT_SCRIPT        = '/zoom/sdk/react.production.min.js';
const REACTDOM_SCRIPT      = '/zoom/sdk/react-dom.production.min.js';
const EMBEDDED_SDK_SCRIPT  = '/zoom/zoomus-websdk-embedded.umd.min.js';

/** Asset path for Zoom WASM/AV files (served from Zoom CDN). */
const ZOOM_ASSET_PATH = 'https://source.zoom.us/2.7.0/lib/av';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

// ── Types ──────────────────────────────────────────────────────────

interface ZoomMeetingData {
  id: number;
  topic: string;
  startUrl: string;
  joinUrl: string;
  password: string;
  startTime: string;
  duration: number;
  status: string;
}

interface ZoomParticipant {
  id: string;
  name: string;
  audioMuted: boolean;
  videoMuted: boolean;
}

/** Raw attendee record from the embedded client API. */
interface AttendeeRecord {
  userId: number;
  userName?: string;
  displayName?: string;
  isHost?: boolean;
  coHost?: boolean;
  muted?: boolean;
  video?: boolean;
  audio?: boolean;
  [key: string]: unknown;
}

interface CurrentUserData {
  userId?: number;
  userName?: string;
  displayName?: string;
  video?: boolean;
  audio?: boolean;
  [key: string]: unknown;
}

type PageState =
  | 'loading'
  | 'unconfigured'
  | 'idle'
  | 'creating'
  | 'meeting-created'
  | 'joining'
  | 'joined'
  | 'error';

// ── Persistence across page refreshes ─────────────────────────────

const PERSISTED_MEETING_KEY = 'zoom_persisted_meeting';

interface PersistedControls {
  audioMuted: boolean;
  videoDisabled: boolean;
  allowUnmute: boolean;
  pinnedUserIds: number[];
}

interface PersistedMeeting {
  meeting: ZoomMeetingData;
  joinUserName: string;
  joinTimestamp: number;
  status: 'created' | 'joined';
  controls: PersistedControls;
}

function persistMeetingData(
  meeting: ZoomMeetingData,
  userName: string,
  status: 'created' | 'joined',
  controls?: PersistedControls,
) {
  try {
    localStorage.setItem(
      PERSISTED_MEETING_KEY,
      JSON.stringify({
        meeting,
        joinUserName: userName,
        joinTimestamp: Date.now(),
        status,
        controls: controls ?? {
          audioMuted: false,
          videoDisabled: false,
          allowUnmute: true,
          pinnedUserIds: [],
        },
      }),
    );
  } catch {
    /* ignore */
  }
}

function loadPersistedMeeting(): PersistedMeeting | null {
  try {
    const raw = localStorage.getItem(PERSISTED_MEETING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedMeeting;
    if (data.joinTimestamp && Date.now() - data.joinTimestamp > 4 * 60 * 60 * 1000) {
      localStorage.removeItem(PERSISTED_MEETING_KEY);
      return null;
    }
    if (!data.controls) {
      data.controls = {
        audioMuted: false,
        videoDisabled: false,
        allowUnmute: true,
        pinnedUserIds: [],
      };
    }
    return data;
  } catch {
    return null;
  }
}

function clearPersistedMeeting() {
  try {
    localStorage.removeItem(PERSISTED_MEETING_KEY);
  } catch {
    /* ignore */
  }
}

function normalizeAttendees(raw: unknown): AttendeeRecord[] {
  if (Array.isArray(raw)) return raw as AttendeeRecord[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.participants)) return obj.participants as AttendeeRecord[];
    if (obj.result && typeof obj.result === 'object') {
      const r = obj.result as Record<string, unknown>;
      if (Array.isArray(r.participants)) return r.participants as AttendeeRecord[];
    }
  }
  return [];
}

// ── ZoomPanel Component ────────────────────────────────────────────

export function ZoomPanel() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [meeting, setMeeting] = useState<ZoomMeetingData | null>(null);
  const [topic, setTopic] = useState('Jersey City LLDM');
  const [muteOnEntry, setMuteOnEntry] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [participants, setParticipants] = useState<ZoomParticipant[]>([]);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoDisabled, setVideoDisabled] = useState(false);
  const [joinUserName, setJoinUserName] = useState('Jersey City LLDM');
  const [refreshingParticipants, setRefreshingParticipants] = useState(false);
  const [allowUnmute, setAllowUnmute] = useState(true);
  const [pinnedUserIds, setPinnedUserIds] = useState<number[]>([]);
  const [viewType, setViewType] = useState<'speaker' | 'gallery'>('speaker');

  const clientRef = useRef<any>(null);
  const sdkInitialized = useRef(false);
  const participantPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preventUnmuteRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const latestControlsRef = useRef<PersistedControls>({
    audioMuted: false,
    videoDisabled: false,
    allowUnmute: true,
    pinnedUserIds: [],
  });

  latestControlsRef.current = { audioMuted, videoDisabled, allowUnmute, pinnedUserIds };

  // ── SDK Initialization (Embedded View) ──────────────────────────

  async function initEmbeddedClient(): Promise<any> {
    if (sdkInitialized.current) return clientRef.current;

    if (!(window as any).React)   await loadScript(REACT_SCRIPT);
    if (!(window as any).ReactDOM) await loadScript(REACTDOM_SCRIPT);
    if (!(window as any).ReactWidgets) await loadScript(EMBEDDED_SDK_SCRIPT);

    const Embedded = (window as any).ReactWidgets as any;
    if (!Embedded?.createClient) {
      throw new Error('Failed to load Zoom Embedded SDK');
    }

    const client = Embedded.createClient();
    clientRef.current = client;
    sdkInitialized.current = true;
    return client;
  }

  // ── Check configuration on mount ─────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    fetch('/api/zoom/settings')
      .then((r) => r.json())
      .then(async (data) => {
        if (cancelled) return;
        if (!data.fullyConfigured) {
          setPageState('unconfigured');
          return;
        }
        const persisted = loadPersistedMeeting();
        if (persisted && persisted.status === 'joined') {
          const oldControls = persisted.controls;
          setMeeting(persisted.meeting);
          setJoinUserName(persisted.joinUserName);
          setPageState('joining');
          try {
            await performJoin(persisted.meeting, persisted.joinUserName, oldControls);
            setAllowUnmute(oldControls.allowUnmute);
            if (oldControls.pinnedUserIds?.length) {
              setTimeout(async () => {
                try {
                  const c = clientRef.current;
                  for (const uid of oldControls.pinnedUserIds) {
                    c?.addPin({ userId: uid });
                  }
                } catch { /* ignore */ }
              }, 2500);
            }
            if (!oldControls.allowUnmute) {
              setTimeout(() => startPreventUnmute(), 3500);
            }
          } catch (err) {
            clearPersistedMeeting();
            setError('Session expired — ' + (err as Error).message);
            setPageState('idle');
          }
        } else if (persisted && persisted.status === 'created') {
          setMeeting(persisted.meeting);
          setJoinUserName(persisted.joinUserName);
          setPageState('meeting-created');
        } else {
          setPageState('idle');
        }
      })
      .catch(() => {
        if (!cancelled) setPageState('unconfigured');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Create meeting ───────────────────────────────────────────────

  async function createMeeting() {
    setPageState('creating');
    setError(null);
    try {
      const res = await fetch('/api/zoom/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, muteUponEntry: muteOnEntry }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to create meeting');
      }
      setMeeting(data);
      setPageState('meeting-created');
      persistMeetingData(data, joinUserName, 'created');
    } catch (err) {
      setError((err as Error).message);
      setPageState('idle');
    }
  }

  // ── Copy invite link ─────────────────────────────────────────────

  async function copyInviteLink() {
    if (!meeting) return;
    const inviteText = `Join Zoom Meeting\n${meeting.joinUrl}\n\nMeeting ID: ${meeting.id}\nPasscode: ${meeting.password}`;
    try {
      await navigator.clipboard.writeText(inviteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // ── Load and join via Embedded View SDK ─────────────────────────

  async function performJoin(
    meetingData: ZoomMeetingData,
    userName: string,
    controls: PersistedControls,
  ): Promise<void> {
    await initEmbeddedClient();
    const client = clientRef.current;

    const sigRes = await fetch('/api/zoom/signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingNumber: meetingData.id, role: 1 }),
    });
    const sigData = await sigRes.json();
    if (!sigRes.ok) {
      throw new Error(sigData.error ?? 'Failed to generate signature');
    }

    const container = zoomContainerRef.current;
    if (!container) throw new Error('Zoom container not mounted');

    await client.init({
      zoomAppRoot: container,
      assetPath: ZOOM_ASSET_PATH,
      language: 'en-US',
    });

    await client.join({
      meetingNumber: String(meetingData.id),
      userName,
      password: meetingData.password || '',
      signature: sigData.signature,
    });

    client.on('user-added', () => refreshParticipantsFromSDK());
    client.on('user-removed', () => refreshParticipantsFromSDK());
    client.on('user-updated', () => refreshParticipantsFromSDK());

    setPageState('joined');
    setAudioMuted(controls.audioMuted);
    setVideoDisabled(controls.videoDisabled);
    startParticipantPolling();
    persistMeetingData(meetingData, userName, 'joined', controls);
  }

  async function joinMeeting() {
    if (!meeting) return;
    setPageState('joining');
    setError(null);
    try {
      await performJoin(meeting, joinUserName, {
        audioMuted: false,
        videoDisabled: true,
        allowUnmute: true,
        pinnedUserIds: [],
      });
    } catch (err) {
      setError((err as Error).message);
      setPageState('meeting-created');
    }
  }

  // ── Participant polling ──────────────────────────────────────────

  async function refreshParticipantsFromSDK() {
    const client = clientRef.current;
    if (!client?.getAttendeeslist) return;
    try {
      const raw = await client.getAttendeeslist();
      const list = normalizeAttendees(raw);
      setParticipants(
        list.map((p) => ({
          id: String(p.userId),
          name: p.userName ?? p.displayName ?? '',
          audioMuted: !!p.muted,
          videoMuted: !p.video,
        })),
      );
    } catch { /* ignore — polling will retry */ }
  }

  async function refreshPinState() {
    const client = clientRef.current;
    if (!client?.getPinList) return;
    try {
      const raw = await client.getPinList();
      const ids: number[] = Array.isArray(raw) ? raw : [];
      setPinnedUserIds(ids.filter((id: number) => typeof id === 'number'));
    } catch { /* ignore */ }
  }

  function startParticipantPolling() {
    if (participantPollRef.current) clearInterval(participantPollRef.current);
    refreshParticipantsFromSDK();
    refreshPinState();
    participantPollRef.current = setInterval(() => {
      refreshParticipantsFromSDK();
      refreshPinState();
    }, 5000);
  }

  function stopParticipantPolling() {
    if (participantPollRef.current) {
      clearInterval(participantPollRef.current);
      participantPollRef.current = null;
    }
    setParticipants([]);
  }

  // ── Local audio/video controls ────────────────────────────────────

  async function toggleAudio() {
    const client = clientRef.current;
    if (!client?.getCurrentUser || !client?.mute) return;
    try {
      const me: CurrentUserData = await client.getCurrentUser();
      if (!me.userId) return;
      await client.mute({ userId: me.userId, mute: !audioMuted });
      setAudioMuted(!audioMuted);
    } catch (err) {
      console.error('Toggle audio failed', err);
    }
  }

  async function toggleVideo() {
    const client = clientRef.current;
    if (!client?.getCurrentUser) return;
    try {
      const me: CurrentUserData = await client.getCurrentUser();
      if (!me || typeof me.video !== 'boolean') return;
      // Embedded view might not expose direct video toggle — proxy through SDK state
      setVideoDisabled(!videoDisabled);
      // The embedded view controls its own camera; we track the state locally
    } catch (err) {
      console.error('Toggle video failed', err);
    }
  }

  // ── Mute/unmute all via embedded client ──────────────────────────

  async function muteAllParticipants() {
    const client = clientRef.current;
    if (!client?.muteAll) return;
    try {
      await client.muteAll({ muteAll: true });
      if (!allowUnmute) startPreventUnmute();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function unmuteAllParticipants() {
    stopPreventUnmute();
    const client = clientRef.current;
    if (!client?.muteAll) return;
    try {
      await client.muteAll({ muteAll: false });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // ── Prevent unmute enforcement (interval re-mutes) ────────────────

  function startPreventUnmute() {
    stopPreventUnmute();
    preventUnmuteRef.current = setInterval(async () => {
      const client = clientRef.current;
      if (!client?.getAttendeeslist || !client?.mute) return;
      try {
        const raw = await client.getAttendeeslist();
        const list = normalizeAttendees(raw);
        for (const p of list) {
          if (!p.isHost && !p.coHost && !p.muted && p.userId) {
            client.mute({ userId: p.userId, mute: true }).catch(() => {});
          }
        }
      } catch { /* ignore */ }
    }, 2000);
  }

  function stopPreventUnmute() {
    if (preventUnmuteRef.current) {
      clearInterval(preventUnmuteRef.current);
      preventUnmuteRef.current = null;
    }
  }

  // ── End meeting ──────────────────────────────────────────────────

  async function endMeeting() {
    if (!meeting) return;

    stopPreventUnmute();
    clearPersistedMeeting();

    try {
      await fetch(`/api/zoom/meetings/${meeting.id}/end`, { method: 'POST' });
    } catch { /* ignore */ }

    const client = clientRef.current;
    if (client?.leaveMeeting) {
      try { await client.leaveMeeting(); } catch { /* ignore */ }
    }

    stopParticipantPolling();
    setMeeting(null);
    setParticipants([]);
    setAudioMuted(false);
    setVideoDisabled(false);
    setPinnedUserIds([]);
    setPageState('idle');
  }

  // ── Refresh participants ─────────────────────────────────────────

  async function refreshParticipants() {
    setRefreshingParticipants(true);
    await refreshParticipantsFromSDK();
    await refreshPinState();
    setRefreshingParticipants(false);
  }

  // ── Mute/unmute specific participant via embedded client ─────────

  async function toggleParticipantAudio(pid: string, currentlyMuted: boolean) {
    const client = clientRef.current;
    if (!client?.mute) return;
    try {
      const userId = parseInt(pid, 10);
      await client.mute({ userId, mute: !currentlyMuted });
      setParticipants((prev) =>
        prev.map((p) => (p.id === pid ? { ...p, audioMuted: !currentlyMuted } : p)),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // ── Pin participants via embedded client ─────────────────────────

  async function pinSelf() {
    const client = clientRef.current;
    if (!client?.getCurrentUser || !client?.addPin || !client?.removeAllPins) return;
    try {
      const me: CurrentUserData = await client.getCurrentUser();
      if (!me.userId) return;
      if (pinnedUserIds.includes(me.userId)) {
        await client.removeAllPins();
      } else {
        await client.addPin({ userId: me.userId });
      }
      await refreshPinState();
    } catch (err) {
      console.error('Pin self failed', err);
    }
  }

  async function toggleParticipantPin(userId: number) {
    const client = clientRef.current;
    if (!client?.addPin || !client?.removeAllPins) return;
    try {
      if (pinnedUserIds.includes(userId)) {
        await client.removeAllPins();
      } else {
        await client.addPin({ userId });
      }
      await refreshPinState();
    } catch (err) {
      console.error('Toggle pin failed', err);
    }
  }

  // ── View type control (embedded view) ──────────────────────────

  async function changeViewType() {
    const client = clientRef.current;
    if (!client?.setViewType) return;
    const next = viewType === 'speaker' ? 'gallery' : 'speaker';
    try {
      await client.setViewType({ viewType: next });
      setViewType(next);
    } catch (err) {
      console.error('Change view type failed', err);
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      const persisted = loadPersistedMeeting();
      if (persisted && persisted.status === 'joined') {
        persistMeetingData(persisted.meeting, persisted.joinUserName, 'joined', latestControlsRef.current);
      }
      stopPreventUnmute();
      stopParticipantPolling();
      const client = clientRef.current;
      if (client?.leaveMeeting) {
        try { client.leaveMeeting(); } catch { /* ignore */ }
      }
    };
  }, []);

  // ── Compute page body content based on state ─────────────────────

  let pageContent: React.ReactNode;

  if (pageState === 'loading') {
    pageContent = (
      <>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Zoom Broadcast</h2>
        </div>
        <div className="bg-zinc-800/50 rounded-lg py-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-700">
          Loading...
        </div>
      </>
    );
  } else if (pageState === 'unconfigured') {
    pageContent = (
      <>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Zoom Broadcast</h2>
        </div>
        <div className="bg-zinc-800/50 rounded-lg py-8 text-center border border-dashed border-zinc-700">
          <div className="text-zinc-400 text-sm mb-2">⚠️ Zoom not configured</div>
          <p className="text-zinc-600 text-xs mb-4">
            Add your Zoom API credentials in Settings to get started.
          </p>
          <a
            href="/settings"
            className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
          >
            Go to Settings
          </a>
        </div>
      </>
    );
  } else if (pageState === 'idle' || pageState === 'creating') {
    pageContent = (
      <>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Zoom Broadcast</h2>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Ready
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Meeting Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. AV Control Room Meeting"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={muteOnEntry}
              onChange={(e) => setMuteOnEntry(e.target.checked)}
              className="accent-emerald-500"
            />
            Mute participants upon entry
          </label>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Join as Name</label>
            <input
              type="text"
              value={joinUserName}
              onChange={(e) => setJoinUserName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
            />
          </div>

          {error && (
            <div className="bg-red-900/30 text-red-300 border border-red-800 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <button
            onClick={createMeeting}
            disabled={pageState === 'creating' || !topic.trim()}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors"
          >
            {pageState === 'creating' ? 'Creating Meeting...' : 'Create Zoom Meeting'}
          </button>
        </div>
      </>
    );
  } else if (pageState === 'meeting-created' || pageState === 'joining') {
    pageContent = (
      <>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Zoom Broadcast</h2>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/40 text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Meeting Created
          </span>
        </div>

        <div className="space-y-4">
          <div className="bg-zinc-800/60 rounded-lg p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-zinc-500">Topic</span>
              <span className="text-sm text-zinc-200 font-medium">{meeting?.topic}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-zinc-500">Meeting ID</span>
              <span className="text-sm text-zinc-200 font-mono">{meeting?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-zinc-500">Passcode</span>
              <span className="text-sm text-zinc-200 font-mono">{meeting?.password || '(none)'}</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 text-red-300 border border-red-800 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={joinMeeting}
              disabled={pageState === 'joining'}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors"
            >
              {pageState === 'joining' ? 'Joining...' : 'Join as Host'}
            </button>
            <button
              onClick={endMeeting}
              disabled={pageState === 'joining'}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-red-800 hover:bg-red-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors"
            >
              End Meeting
            </button>
          </div>
        </div>
      </>
    );
  } else {
    pageContent = (
      <>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Zoom Broadcast</h2>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>

        <div className="bg-zinc-800/60 rounded-lg p-3 mb-4">
          <div className="text-sm text-zinc-200 font-medium">{meeting?.topic}</div>
          <div className="text-xs text-zinc-500 font-mono mt-0.5">ID: {meeting?.id}</div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={toggleAudio}
            className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              audioMuted
                ? 'bg-red-900/40 text-red-300 border border-red-800 hover:bg-red-900/60'
                : 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-emerald-700'
            }`}
          >
            <span>{audioMuted ? '🔇' : '🎤'}</span>
            <span>{audioMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
          </button>
          <button
            onClick={toggleVideo}
            className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              videoDisabled
                ? 'bg-red-900/40 text-red-300 border border-red-800 hover:bg-red-900/60'
                : 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-emerald-700'
            }`}
          >
            <span>{videoDisabled ? '🔴' : '📹'}</span>
            <span>{videoDisabled ? 'Start Camera' : 'Stop Camera'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={pinSelf}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              pinnedUserIds.length > 0
                ? 'bg-blue-900/40 text-blue-300 border border-blue-800'
                : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-blue-700'
            }`}
          >
            📌 Pin Self
          </button>
          <button
            onClick={changeViewType}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              viewType === 'gallery'
                ? 'bg-blue-900/40 text-blue-300 border border-blue-800'
                : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-blue-700'
            }`}
          >
            {viewType === 'speaker' ? '⊞ Gallery View' : '⊟ Speaker View'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={muteAllParticipants}
            className="px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-800 hover:bg-amber-700 text-amber-200 transition-colors"
          >
            Mute All
          </button>
          <button
            onClick={unmuteAllParticipants}
            className="px-4 py-2.5 text-sm font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
          >
            Unmute All
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-500 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={allowUnmute}
            onChange={(e) => setAllowUnmute(e.target.checked)}
            className="accent-emerald-500"
          />
          Allow participants to unmute themselves after Mute All
        </label>

        <button
          onClick={endMeeting}
          className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-red-800 hover:bg-red-700 text-white transition-colors mb-4"
        >
          End Meeting
        </button>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Participants ({participants.length})
            </h3>
            <button
              onClick={refreshParticipants}
              disabled={refreshingParticipants}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {refreshingParticipants ? '...' : 'Refresh'}
            </button>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {participants.length === 0 && (
              <div className="text-xs text-zinc-600 italic py-2 text-center">
                No participants yet
              </div>
            )}
            {participants.map((p) => {
              const uid = parseInt(p.id, 10);
              const isPinned = pinnedUserIds.includes(uid);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-zinc-800/40 rounded-md px-3 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-zinc-300 truncate max-w-24">{p.name}</span>
                    <span
                      className={`text-[10px] shrink-0 ${p.audioMuted ? 'text-red-400' : 'text-emerald-400'}`}
                    >
                      {p.audioMuted ? '🔇' : '🔊'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleParticipantPin(uid)}
                      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                        isPinned
                          ? 'bg-blue-800/60 text-blue-200'
                          : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-400'
                      }`}
                      title={isPinned ? 'Unpin' : 'Pin'}
                    >
                      📌
                    </button>
                    <button
                      onClick={() => toggleParticipantAudio(p.id, p.audioMuted)}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"
                      title={p.audioMuted ? 'Unmute' : 'Mute'}
                    >
                      {p.audioMuted ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mt-3 bg-red-900/30 text-red-300 border border-red-800 px-3 py-2 rounded-md text-sm">
            {error}
          </div>
        )}
      </>
    );
  }

  const showContainer = pageState === 'meeting-created' || pageState === 'joining' || pageState === 'joined';

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
      {showContainer && meeting && (
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={meeting.joinUrl ?? ''}
            className="flex-1 px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 font-mono focus:outline-none"
          />
          <button
            onClick={copyInviteLink}
            className={`shrink-0 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              copied
                ? 'bg-emerald-700 text-emerald-200'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
            }`}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}

      <div
        ref={zoomContainerRef}
        id="zoom-container"
        className={`min-h-[480px] w-full rounded-lg overflow-hidden ${showContainer ? '' : 'hidden'}`}
      />
      {pageContent}
    </div>
  );
}
