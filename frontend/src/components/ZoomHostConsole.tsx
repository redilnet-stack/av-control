import { useEffect, useRef, useState } from 'react';
import { createEmbeddedClient, ZOOM_ASSET_PATH } from '../lib/zoomSdk.js';

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

type HostState =
  | 'checking'
  | 'waiting'
  | 'joining'
  | 'joined'
  | 'ended'
  | 'error';

type MediaState = 'starting' | 'on' | 'off' | 'denied';

export function ZoomHostConsole() {
  const [hostState, setHostState] = useState<HostState>('checking');
  const [meeting, setMeeting] = useState<ZoomMeetingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [mediaState, setMediaState] = useState<MediaState>('off');

  const clientRef = useRef<any>(null);
  const joinedMeetingIdRef = useRef<number | null>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const participantPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices?.enumerateDevices().then((devices) => {
      if (!cancelled) setCameras(devices.filter((d) => d.kind === 'videoinput'));
    }).catch(() => {});

    async function pollForMeeting() {
      if (cancelled) return;
      try {
        const res = await fetch('/api/zoom/meetings/current');
        const data = await res.json();
        if (cancelled) return;
        const m = data.meeting as ZoomMeetingData | null;
        if (m && joinedMeetingIdRef.current !== m.id) {
          setMeeting(m);
          await joinAsHost(m);
        } else if (!m && !clientRef.current) {
          setMeeting(null);
          setHostState('waiting');
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    async function joinAsHost(m: ZoomMeetingData) {
      setHostState('joining');
      setError(null);
      setMediaState('off');
      joinedMeetingIdRef.current = m.id;
      try {
        const client = await createEmbeddedClient();
        if (cancelled) return;
        clientRef.current = client;

        const sigRes = await fetch('/api/zoom/signature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingNumber: m.id, role: 1 }),
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
          meetingNumber: String(m.id),
          userName: 'Venue Host',
          password: m.password || '',
          signature: sigData.signature,
        });

        autoStartMedia(container);

        client.on('user-added', refreshParticipants);
        client.on('user-removed', refreshParticipants);

        participantPollRef.current = setInterval(refreshParticipants, 5000);
        refreshParticipants();

        await fetch('/api/zoom/meetings/current/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId: m.id }),
        }).catch(() => {});

        if (!cancelled) setHostState('joined');
      } catch (err) {
        joinedMeetingIdRef.current = null;
        if (!cancelled) {
          setError((err as Error).message);
          setHostState('error');
        }
      }
    }

    async function refreshParticipants() {
      const client = clientRef.current;
      if (!client?.getAttendeeslist) return;
      try {
        const raw = await client.getAttendeeslist();
        const list = Array.isArray(raw) ? raw : (raw as any)?.participants ?? [];
        setParticipantCount(list.length);
      } catch { /* ignore */ }
    }

    pollForMeeting();
    const pollId = setInterval(pollForMeeting, 3000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      if (participantPollRef.current) clearInterval(participantPollRef.current);
    };
  }, []);

  async function endMeeting() {
    if (!meeting) return;
    setHostState('ended');
    const id = meeting.id;
    setMeeting(null);
    joinedMeetingIdRef.current = null;
    try {
      await fetch(`/api/zoom/meetings/${id}/end`, { method: 'POST' });
    } catch { /* ignore */ }
    const client = clientRef.current;
    if (client?.leaveMeeting) {
      try { await client.leaveMeeting(); } catch { /* ignore */ }
    }
    clientRef.current = null;
  }

  /**
   * The embedded client has no public startVideo/startAudio (mediaCapture()
   * is the local-recording API), so the SDK's own in-meeting toolbar buttons
   * — which flip to "Stop Video" / "Mute" once devices are live — are used.
   */
  async function autoStartMedia(container: HTMLDivElement) {
    setMediaState('starting');

    const label = (b: HTMLButtonElement) =>
      ((b.getAttribute('title') ?? '') + ' ' + (b.getAttribute('aria-label') ?? '')).toLowerCase();

    const inContainer = () => Array.from(container.querySelectorAll('button'));

    const findBtn = (re: RegExp) => inContainer().find((b) => re.test(label(b)));

    const findToggle = (
      offRe: RegExp,
      onRe: RegExp,
    ): { btn: HTMLButtonElement | null; alreadyOn: boolean } => {
      const off = findBtn(offRe);
      if (off) return { btn: off, alreadyOn: false };
      return { btn: findBtn(onRe) ?? null, alreadyOn: true };
    };

    const toolbarDeadline = Date.now() + 30_000;
    let video: { btn: HTMLButtonElement | null; alreadyOn: boolean } | null = null;
    let audio: { btn: HTMLButtonElement | null; alreadyOn: boolean } | null = null;

    while (Date.now() < toolbarDeadline) {
      if (!video) video = findToggle(/(^|\s)(start video|video off)/, /(^|\s)(stop video|video on)/);
      if (!audio) audio = findToggle(/(^|\s)(join audio|audio)(\s|$)/, /(^|\s)(mute|unmute)(\s|$)/);
      if (video && audio) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (video && !video.alreadyOn) video.btn?.click();
    if (audio && !audio.alreadyOn) audio.btn?.click();

    const confirmDeadline = Date.now() + 15_000;
    const bothOn = () => !!findBtn(/(^|\s)(stop video|video on)/) && !!findBtn(/(^|\s)(mute|unmute)(\s|$)/);
    while (Date.now() < confirmDeadline && !bothOn()) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    setMediaState(bothOn() ? 'on' : 'off');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-200">Venue Host Console</h2>
        <span className="text-sm text-zinc-500">
          {hostState === 'waiting' && 'Waiting for a meeting to be created…'}
          {hostState === 'joining' && 'Joining as host…'}
          {hostState === 'joined' && `Joined — ${participantCount} participant(s)`}
          {hostState === 'ended' && 'Meeting ended'}
          {hostState === 'error' && 'Join failed'}
        </span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {cameras.length === 0 && hostState !== 'joined' && (
        <div className="rounded-lg bg-amber-950 border border-amber-800 p-3 text-sm text-amber-300">
          No camera detected on this machine. The meeting will have no video feed.
        </div>
      )}
      {cameras.length > 0 && (
        <div className="text-xs text-zinc-500">
          Camera in use: <span className="text-zinc-300">{cameras[0].label || 'default capture device'}</span>
        </div>
      )}

      {hostState === 'joined' && (
        <div className="text-xs">
          {mediaState === 'on' && <span className="text-emerald-400">Camera & mic: on</span>}
          {mediaState === 'starting' && <span className="text-zinc-400">Enabling camera & mic…</span>}
          {mediaState === 'denied' && (
            <span className="text-red-400">Camera/mic permission denied — allow access in browser settings</span>
          )}
          {mediaState === 'off' && (
            <span className="text-amber-400">Camera/mic off — capture failed or no device</span>
          )}
        </div>
      )}

      {meeting && (
        <div className="text-sm text-zinc-400">
          Meeting {meeting.id} — <span className="text-zinc-200">{meeting.topic}</span>
        </div>
      )}

      <div ref={zoomContainerRef} className="rounded-xl overflow-hidden bg-black min-h-[280px]" />

      {(hostState === 'joined' || hostState === 'ended') && (
        <button
          onClick={endMeeting}
          className="px-4 py-2 rounded-lg bg-red-900 hover:bg-red-800 text-white text-sm font-medium transition-colors"
        >
          {hostState === 'joined' ? 'End Meeting' : 'Ended — close'}
        </button>
      )}
    </div>
  );
}
