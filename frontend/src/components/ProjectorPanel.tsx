import { useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';

// ── Types ──────────────────────────────────────────────────────────

type ProjectorCommand = 'powerOn' | 'powerOff' | 'hdmi1' | 'hdmi2' | 'hdmi3';
type ScreenCommand = 'up' | 'down' | 'stop';

interface ProjectorStatus {
  broadlinkConnected: boolean;
  broadlinkMock: boolean;
  projectorEnabled: boolean;
  screenEnabled: boolean;
  hasIrCodes: {
    projector: boolean;
    screen: boolean;
  };
}

const PROJECTOR_INPUTS: { cmd: ProjectorCommand; label: string }[] = [
  { cmd: 'hdmi1', label: 'HDMI 1' },
  { cmd: 'hdmi2', label: 'HDMI 2' },
  { cmd: 'hdmi3', label: 'HDMI 3' },
];

// ── ProjectorPanel Component ────────────────────────────────────────

export function ProjectorPanel({
  socket,
  connected: _connected,
}: {
  socket: React.MutableRefObject<Socket | null>;
  connected: boolean;
}) {
  const [status, setStatus] = useState<ProjectorStatus | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  // ── Fetch status ─────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/projector/status');
      const data = await res.json();
      setStatus(data);
    } catch {
      /* backend not reachable */
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ── WebSocket events ─────────────────────────────────────────────

  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    function onEvent(event: { device: string; type: string; data: unknown }) {
      if (event.device !== 'broadlink') return;

      switch (event.type) {
        case 'connected':
          setStatus((prev) => prev ? { ...prev, broadlinkConnected: true } : prev);
          break;
        case 'disconnected':
          setStatus((prev) => prev ? { ...prev, broadlinkConnected: false } : prev);
          break;
      }
    }

    s.on('deviceEvent', onEvent);
    return () => {
      s.off('deviceEvent', onEvent);
    };
  }, [socket, _connected]);

  // ── API helpers ──────────────────────────────────────────────────

  const sendProjectorCommand = useCallback(async (command: ProjectorCommand) => {
    setSending(`projector:${command}`);
    try {
      await fetch('/api/projector/projector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
    } catch {
      /* ignore */
    } finally {
      setSending(null);
    }
  }, []);

  const sendScreenCommand = useCallback(async (command: ScreenCommand) => {
    setSending(`screen:${command}`);
    try {
      await fetch('/api/projector/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
    } catch {
      /* ignore */
    } finally {
      setSending(null);
    }
  }, []);

  // ── Derived ──────────────────────────────────────────────────────

  const blConnected = status?.broadlinkConnected ?? false;
  const projConfigured = status?.hasIrCodes.projector ?? false;
  const screenConfigured = status?.hasIrCodes.screen ?? false;
  const isBusy = sending !== null;

  const isLoading = status === null;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">Projector &amp; Screen</h2>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            blConnected
              ? 'bg-emerald-900/40 text-emerald-300'
              : 'bg-red-900/40 text-red-300'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              blConnected ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {blConnected ? 'IR Ready' : 'Offline'}
        </span>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="bg-zinc-800/50 rounded-lg py-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-700">
          Loading status...
        </div>
      )}

      {/* Not configured */}
      {!isLoading && !blConnected && (
        <div className="bg-zinc-800/50 rounded-lg py-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-700">
          Configure Broadlink IR device in Settings
        </div>
      )}

      {/* Main controls */}
      {!isLoading && blConnected && (
        <div className="space-y-4">
          {/* Projector section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Projector
              </h3>
              {!projConfigured && (
                <span className="text-[10px] text-amber-500">No IR codes — configure in Settings</span>
              )}
            </div>

            {projConfigured && (
              <>
                {/* Power row */}
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => sendProjectorCommand('powerOn')}
                    disabled={isBusy}
                    className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition-colors bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white"
                  >
                    {sending === 'projector:powerOn' ? '...' : 'Power On'}
                  </button>
                  <button
                    onClick={() => sendProjectorCommand('powerOff')}
                    disabled={isBusy}
                    className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition-colors bg-red-700 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white"
                  >
                    {sending === 'projector:powerOff' ? '...' : 'Power Off'}
                  </button>
                </div>

                {/* Input selection */}
                <div>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">
                    Input Source
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {PROJECTOR_INPUTS.map(({ cmd, label }) => (
                      <button
                        key={cmd}
                        onClick={() => sendProjectorCommand(cmd)}
                        disabled={isBusy}
                        className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 hover:border-emerald-700"
                      >
                        {sending === `projector:${cmd}` ? '...' : label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!projConfigured && (
              <div className="text-[11px] text-zinc-600 italic mt-1">
                Learn IR codes in Settings → Projector section
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800" />

          {/* Screen section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Screen
              </h3>
              {!screenConfigured && (
                <span className="text-[10px] text-amber-500">No IR codes</span>
              )}
            </div>

            {screenConfigured && (
              <div className="flex gap-2">
                <button
                  onClick={() => sendScreenCommand('up')}
                  disabled={isBusy}
                  className="flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700"
                >
                  {sending === 'screen:up' ? '...' : '▲ Up'}
                </button>
                <button
                  onClick={() => sendScreenCommand('stop')}
                  disabled={isBusy}
                  className="flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700"
                >
                  {sending === 'screen:stop' ? '...' : '■ Stop'}
                </button>
                <button
                  onClick={() => sendScreenCommand('down')}
                  disabled={isBusy}
                  className="flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700"
                >
                  {sending === 'screen:down' ? '...' : '▼ Down'}
                </button>
              </div>
            )}

            {!screenConfigured && (
              <div className="text-[11px] text-zinc-600 italic mt-1">
                Learn IR codes in Settings → Screen section
              </div>
            )}
          </div>


        </div>
      )}
    </div>
  );
}
