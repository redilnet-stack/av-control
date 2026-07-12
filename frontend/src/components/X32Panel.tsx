import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

interface MeterData {
  values: number[];
}

export function X32Panel({
  socket,
  connected,
}: {
  socket: React.MutableRefObject<Socket | null>;
  connected: boolean;
}) {
  const [meters, setMeters] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const [x32Connected, setX32Connected] = useState(false);

  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    function onEvent(event: {
      device: string;
      type: string;
      data: unknown;
    }) {
      if (event.device !== 'x32') return;

      switch (event.type) {
        case 'meter':
          setMeters((event.data as MeterData).values);
          break;
        case 'connected':
          setX32Connected(true);
          break;
        case 'disconnected':
          setX32Connected(false);
          break;
      }
    }

    s.on('deviceEvent', onEvent);
    return () => {
      s.off('deviceEvent', onEvent);
    };
  }, [socket]);

  async function setChannelMute(ch: number, mute: boolean) {
    await fetch(`/api/x32/channels/${ch}/mute`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute }),
    });
  }

  async function setMainMute(mute: boolean) {
    await fetch('/api/x32/main/mute', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute }),
    });
  }

  const barColor = (val: number) => {
    if (val > 0.9) return 'bg-red-500';
    if (val > 0.75) return 'bg-yellow-400';
    return 'bg-emerald-400';
  };

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">X32 Mixer</h2>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            connected && x32Connected
              ? 'bg-emerald-900/40 text-emerald-300'
              : 'bg-red-900/40 text-red-300'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connected && x32Connected ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {connected && x32Connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Meter Bridge — Channels 1-8 */}
      <div className="mb-4">
        <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-medium">
          Meters (Ch 1-8)
        </div>
        <div className="flex gap-1 items-end h-20">
          {meters.map((val, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-zinc-800 rounded-sm h-16 relative overflow-hidden">
                <div
                  className={`absolute bottom-0 w-full rounded-sm transition-all duration-75 ${barColor(val)}`}
                  style={{ height: `${Math.max(2, val * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Controls */}
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => (
          <button
            key={ch}
            onClick={() => setChannelMute(ch, true)}
            className="px-2 py-1.5 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 transition-colors text-center"
          >
            Ch {ch}
            <br />
            <span className="text-[10px] text-zinc-500">Mute</span>
          </button>
        ))}
      </div>

      {/* Main Controls */}
      <div className="mt-4 pt-3 border-t border-zinc-800 flex gap-2">
        <button
          onClick={() => setMainMute(true)}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-300 transition-colors"
        >
          Mute Main
        </button>
        <button
          onClick={() => setMainMute(false)}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-300 transition-colors"
        >
          Unmute Main
        </button>
      </div>
    </div>
  );
}
