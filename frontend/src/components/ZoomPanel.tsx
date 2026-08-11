import { useEffect, useState, type ReactNode } from 'react';

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

type PageState =
  | 'loading'
  | 'unconfigured'
  | 'idle'
  | 'creating'
  | 'meeting-created'
  | 'error';

// ── ZoomPanel (remote controller) ──────────────────────────────────
// Creates meetings via the backend REST API. The actual meeting host
// is the venue machine, which runs ZoomHostConsole and joins with the
// Web SDK — so no camera/mic permission is ever requested here.

export function ZoomPanel() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [meeting, setMeeting] = useState<ZoomMeetingData | null>(null);
  const [topic, setTopic] = useState('Jersey City LLDM');
  const [muteOnEntry, setMuteOnEntry] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState(false);
  const [participants, setParticipants] = useState<ZoomParticipant[]>([]);
  const [refreshingParticipants, setRefreshingParticipants] = useState(false);

  // ── Check configuration on mount ─────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    fetch('/api/zoom/settings')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPageState(data.fullyConfigured ? 'idle' : 'unconfigured');
      })
      .catch(() => {
        if (!cancelled) setPageState('unconfigured');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Poll meeting status + participants while a meeting exists ────

  useEffect(() => {
    if (!meeting || pageState !== 'meeting-created') return;
    let cancelled = false;
    const meetingId = meeting.id;

    async function tick() {
      try {
        const res = await fetch(`/api/zoom/meetings/${meetingId}`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.status === 'started' || data?.status === 'live') {
          setLive(true);
          refreshParticipantsREST();
        } else {
          setLive(false);
        }
      } catch { /* polling will retry */ }
    }

    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [meeting?.id, pageState]);

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
      setLive(false);
      setParticipants([]);
      setPageState('meeting-created');
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

  // ── Participant controls via REST API ────────────────────────────

  async function refreshParticipantsREST() {
    if (!meeting) return;
    try {
      const res = await fetch(`/api/zoom/meetings/${meeting.id}/participants`);
      const data = await res.json();
      const list = Array.isArray(data.participants) ? data.participants : [];
      setParticipants(
        list.map((p: any) => ({
          id: String(p.id ?? p.userId ?? ''),
          name: p.name ?? p.user_name ?? '',
          audioMuted: !!p.audioMuted,
          videoMuted: !!p.videoMuted,
        })),
      );
    } catch { /* REST participants may be unavailable — ignore */ }
  }

  async function refreshParticipants() {
    setRefreshingParticipants(true);
    await refreshParticipantsREST();
    setRefreshingParticipants(false);
  }

  async function muteAllParticipants() {
    if (!meeting) return;
    setError(null);
    try {
      const res = await fetch(`/api/zoom/meetings/${meeting.id}/mute-all`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to mute all');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function unmuteAllParticipants() {
    if (!meeting) return;
    setError(null);
    try {
      const res = await fetch(`/api/zoom/meetings/${meeting.id}/unmute-all`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to unmute all');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleParticipantAudio(pid: string, currentlyMuted: boolean) {
    if (!meeting) return;
    const action = currentlyMuted ? 'unmute' : 'mute';
    try {
      const res = await fetch(
        `/api/zoom/meetings/${meeting.id}/participants/${encodeURIComponent(pid)}/${action}`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update participant');
      setParticipants((prev) =>
        prev.map((p) => (p.id === pid ? { ...p, audioMuted: !currentlyMuted } : p)),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // ── End meeting ──────────────────────────────────────────────────

  async function endMeeting() {
    if (!meeting) return;
    setError(null);
    try {
      await fetch(`/api/zoom/meetings/${meeting.id}/end`, { method: 'POST' });
    } catch { /* ignore */ }
    setMeeting(null);
    setParticipants([]);
    setLive(false);
    setPageState('idle');
  }

  // ── Render ───────────────────────────────────────────────────────

  let pageContent: ReactNode;

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

          <div className="text-xs text-zinc-600">
            The venue host console will join automatically with the room camera.
          </div>
        </div>
      </>
    );
  } else {
    pageContent = (
      <>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Zoom Broadcast</h2>
          {live ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/40 text-blue-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Waiting for host…
            </span>
          )}
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

          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={meeting?.joinUrl ?? ''}
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

          {error && (
            <div className="bg-red-900/30 text-red-300 border border-red-800 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={muteAllParticipants}
              disabled={!live}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-800 hover:bg-amber-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-amber-200 transition-colors"
            >
              Mute All
            </button>
            <button
              onClick={unmuteAllParticipants}
              disabled={!live}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-300 border border-zinc-700 transition-colors"
            >
              Unmute All
            </button>
          </div>

          <button
            onClick={endMeeting}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-red-800 hover:bg-red-700 text-white transition-colors"
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
                disabled={refreshingParticipants || !live}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {refreshingParticipants ? '...' : 'Refresh'}
              </button>
            </div>

            <div className="space-y-1 max-h-48 overflow-y-auto">
              {participants.length === 0 && (
                <div className="text-xs text-zinc-600 italic py-2 text-center">
                  {live ? 'No participants yet' : 'Waiting for the host to join…'}
                </div>
              )}
              {participants.map((p) => (
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
                  <button
                    onClick={() => toggleParticipantAudio(p.id, p.audioMuted)}
                    disabled={!live}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-400 transition-colors"
                  >
                    {p.audioMuted ? 'Unmute' : 'Mute'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
      {pageContent}
    </div>
  );
}
