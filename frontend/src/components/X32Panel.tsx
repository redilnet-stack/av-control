import { useEffect, useState, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';

// ── Types ──────────────────────────────────────────────────────────

type BankId = 'ch1-8' | 'ch9-16' | 'ch17-24' | 'ch25-32' | 'auxin' | 'dcas' | 'main';

interface BankDef {
  id: BankId;
  label: string;
  channelStart?: number;
  auxCount?: number;
}

const BANKS: BankDef[] = [
  { id: 'ch1-8', label: 'Ch 1-8', channelStart: 1 },
  { id: 'ch9-16', label: 'Ch 9-16', channelStart: 9 },
  { id: 'ch17-24', label: 'Ch 17-24', channelStart: 17 },
  { id: 'ch25-32', label: 'Ch 25-32', channelStart: 25 },
  { id: 'auxin', label: 'AUX In', auxCount: 6 },
  { id: 'dcas', label: 'DCAs' },
  { id: 'main', label: 'Main' },
];

// ── FaderSlider Component ──────────────────────────────────────────

function FaderSlider({
  value: propValue,
  onChange,
  muted,
  disabled,
  size,
}: {
  value: number;
  onChange: (v: number) => void;
  muted?: boolean;
  disabled?: boolean;
  size?: 'normal' | 'large';
}) {
  const [localValue, setLocalValue] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Use local value during drag for immediate visual feedback,
  // fall back to prop value when idle.
  const displayValue = dragging && localValue !== null ? localValue : propValue;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setDragging(true);

    const update = (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setLocalValue(x);
      onChange(x);
    };

    update(e.clientX);

    const onMove = (ev: MouseEvent) => update(ev.clientX);
    const onUp = () => {
      setDragging(false);
      setLocalValue(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const isLarge = size === 'large';
  const trackH = isLarge ? 'h-5' : 'h-2.5';
  const thumbSize = isLarge ? 'w-5 h-5' : 'w-3.5 h-3.5';
  const thumbMargin = isLarge ? '-10px' : '-7px';

  const fillColor = muted
    ? 'bg-zinc-500'
    : dragging
      ? 'bg-emerald-400'
      : 'bg-emerald-500';

  return (
    <div
      ref={trackRef}
      className={`relative ${trackH} rounded-full cursor-pointer ${muted ? 'bg-zinc-700' : 'bg-zinc-800'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`absolute left-0 top-0 h-full rounded-full transition-colors ${fillColor}`}
        style={{ width: `${displayValue * 100}%` }}
      />
      <div
        className={`absolute top-1/2 -translate-y-1/2 ${thumbSize} rounded-full shadow-md border border-zinc-600 transition-colors ${
          muted ? 'bg-zinc-400' : 'bg-white'
        }`}
        style={{ left: `${displayValue * 100}%`, marginLeft: thumbMargin }}
      />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function X32Panel({
  socket,
  connected: _connected,
}: {
  socket: React.MutableRefObject<Socket | null>;
  connected: boolean;
}) {
  const [activeBank, setActiveBank] = useState<BankId>('ch1-8');
  const [selectedChannel, setSelectedChannel] = useState<number>(1);
  const [meters, setMeters] = useState<number[]>(() => new Array(32).fill(0));
  const [channelMutes, setChannelMutes] = useState<Map<number, boolean>>(() => new Map());
  const [channelFaders, setChannelFaders] = useState<Map<number, number>>(() => new Map());
  const [dcaMutes, setDcaMutes] = useState<Map<number, boolean>>(() => new Map());
  const [dcaFaders, setDcaFaders] = useState<Map<number, number>>(() => new Map());
  const [mainMuted, setMainMuted] = useState(false);
  const [mainFader, setMainFader] = useState(0.75);
  const [auxInMutes, setAuxInMutes] = useState<Map<number, boolean>>(() => new Map());
  const [auxInFaders, setAuxInFaders] = useState<Map<number, number>>(() => new Map());
  const [selectedDca, setSelectedDca] = useState(1);
  const [selectedAuxIn, setSelectedAuxIn] = useState(1);
  const [x32Connected, setX32Connected] = useState(false);

  // ── Initial state fetch ──────────────────────────────────────────

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setX32Connected(data.devices?.x32?.connected ?? false);
    } catch {
      /* backend not reachable */
    }
  }, []);

  useEffect(() => {
    fetchInitialState();
  }, [fetchInitialState]);

  // ── WebSocket event handlers ─────────────────────────────────────

  useEffect(() => {
    const s = socket.current;
    if (!s) return;

    function onEvent(event: { device: string; type: string; data: unknown }) {
      if (event.device !== 'x32') return;

      switch (event.type) {
        case 'meter': {
          const { offset, values } = event.data as { offset: number; values: number[] };
          setMeters((prev) => {
            const next = prev.slice();
            for (let i = 0; i < values.length; i++) {
              next[offset + i] = values[i];
            }
            return next;
          });
          break;
        }
        case 'connected':
          setX32Connected(true);
          break;
        case 'disconnected':
          setX32Connected(false);
          break;
        case 'channelMute': {
          const { channel, muted } = event.data as { channel: number; muted: boolean };
          setChannelMutes((prev) => {
            const next = new Map(prev);
            next.set(channel, muted);
            return next;
          });
          break;
        }
        case 'channelFader': {
          const { channel, level } = event.data as { channel: number; level: number };
          setChannelFaders((prev) => {
            const next = new Map(prev);
            next.set(channel, level);
            return next;
          });
          break;
        }
        case 'dcaMute': {
          const { dca, muted } = event.data as { dca: number; muted: boolean };
          setDcaMutes((prev) => {
            const next = new Map(prev);
            next.set(dca, muted);
            return next;
          });
          break;
        }
        case 'dcaFader': {
          const { dca, level } = event.data as { dca: number; level: number };
          setDcaFaders((prev) => {
            const next = new Map(prev);
            next.set(dca, level);
            return next;
          });
          break;
        }
        case 'auxInMute': {
          const { aux, muted } = event.data as { aux: number; muted: boolean };
          setAuxInMutes((prev) => { const n = new Map(prev); n.set(aux, muted); return n; });
          break;
        }
        case 'auxInFader': {
          const { aux, level } = event.data as { aux: number; level: number };
          setAuxInFaders((prev) => { const n = new Map(prev); n.set(aux, level); return n; });
          break;
        }
        case 'mainMute': {
          const { muted } = event.data as { muted: boolean };
          setMainMuted(muted);
          break;
        }
        case 'mainFader': {
          const { level } = event.data as { level: number };
          setMainFader(level);
          break;
        }
      }
    }

    s.on('deviceEvent', onEvent);
    return () => {
      s.off('deviceEvent', onEvent);
    };
  }, [socket, _connected]);

  // When bank changes, reset selected channel to the first in the bank
  const activeBankDef = BANKS.find((b) => b.id === activeBank)!;
  useEffect(() => {
    if (activeBankDef.channelStart) {
      setSelectedChannel(activeBankDef.channelStart);
    }
  }, [activeBank, activeBankDef.channelStart]);

  // ── API helpers ──────────────────────────────────────────────────

  const putChannelMute = useCallback(async (ch: number, mute: boolean) => {
    await fetch(`/api/x32/channels/${ch}/mute`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute }),
    });
  }, []);

  const putChannelFader = useCallback(async (ch: number, level: number) => {
    await fetch(`/api/x32/channels/${ch}/fader`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    });
  }, []);

  const putDcaMute = useCallback(async (dca: number, mute: boolean) => {
    await fetch(`/api/x32/dcas/${dca}/mute`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute }),
    });
  }, []);

  const putDcaFader = useCallback(async (dca: number, level: number) => {
    await fetch(`/api/x32/dcas/${dca}/fader`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    });
  }, []);

  const putAuxInMute = useCallback(async (aux: number, mute: boolean) => {
    await fetch(`/api/x32/auxin/${aux}/mute`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute }),
    });
  }, []);

  const putAuxInFader = useCallback(async (aux: number, level: number) => {
    await fetch(`/api/x32/auxin/${aux}/fader`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    });
  }, []);

  const putMainMute = useCallback(async (mute: boolean) => {
    await fetch('/api/x32/main/mute', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mute }),
    });
  }, []);

  const putMainFader = useCallback(async (level: number) => {
    await fetch('/api/x32/main/fader', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    });
  }, []);

  // ── Derived data ────────────────────────────────────────────────

  const channelStart = activeBankDef.channelStart ?? 1;
  const bankChannels = activeBankDef.channelStart
    ? Array.from({ length: 8 }, (_, i) => channelStart + i)
    : [];

  // ── Meter bar color ─────────────────────────────────────────────

  const barColor = (val: number) => {
    if (val > 0.9) return 'bg-red-500';
    if (val > 0.75) return 'bg-yellow-400';
    return 'bg-emerald-400';
  };

  const shortLabel = (ch: number) => `Ch ${ch}`;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-zinc-100">X32 Mixer</h2>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            x32Connected
              ? 'bg-emerald-900/40 text-emerald-300'
              : 'bg-red-900/40 text-red-300'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              x32Connected ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {x32Connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Bank Tabs — compact chips */}
      <div className="flex gap-0.5 mb-4 overflow-x-auto">
        {BANKS.map((bank) => (
          <button
            key={bank.id}
            onClick={() => setActiveBank(bank.id)}
            className={`px-2 py-0.5 text-[10px] leading-4 font-semibold rounded transition-colors whitespace-nowrap tracking-tight ${
              activeBank === bank.id
                ? 'bg-emerald-700 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {bank.label}
          </button>
        ))}
      </div>

      {/* ── Channel Bank (single selected channel) ──────────────── */}
      {activeBankDef.channelStart && (
        <div>
          {/* Channel selector dropdown */}
          <div className="mb-3">
            <label className="text-xs text-zinc-500 mr-2 uppercase tracking-wider font-medium">
              Channel
            </label>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(Number(e.target.value))}
              className="bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-emerald-600 w-full sm:w-auto"
            >
              {bankChannels.map((ch) => (
                <option key={ch} value={ch}>
                  {shortLabel(ch)}
                </option>
              ))}
            </select>
          </div>

          {/* Selected channel detail */}
          {(() => {
            const ch = selectedChannel;
            const isMuted = channelMutes.get(ch) ?? false;
            const fader = channelFaders.get(ch) ?? 0.75;
            const meterVal = meters[ch - 1] ?? 0;

            return (
              <div className="bg-zinc-800/50 rounded-lg p-4">
                {/* Channel header + mute */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base font-semibold text-zinc-200">
                    {shortLabel(ch)}
                  </span>
                  <button
                    onClick={() => putChannelMute(ch, !isMuted)}
                    className={`text-sm font-medium px-5 py-1.5 rounded-lg transition-colors ${
                      isMuted
                        ? 'bg-red-900/50 text-red-300 hover:bg-red-800/50 ring-1 ring-red-700'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                  >
                    {isMuted ? 'Muted' : 'Mute'}
                  </button>
                </div>

                {/* Meter strip */}
                <div className="mb-4">
                  <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">
                    Level
                  </div>
                  <div className="bg-zinc-900 rounded-sm h-6 relative overflow-hidden">
                    <div
                      className={`absolute bottom-0 left-0 h-full rounded-sm transition-all duration-75 ${barColor(meterVal)}`}
                      style={{ width: `${Math.max(2, meterVal * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Large fader */}
                <div className="mb-2">
                  <FaderSlider
                    value={fader}
                    onChange={(v) => putChannelFader(ch, v)}
                    muted={isMuted}
                    size="large"
                  />
                </div>

                {/* Level readout */}
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>-∞</span>
                  <span className="tabular-nums font-medium text-zinc-300">
                    {fader.toFixed(2)}
                  </span>
                  <span>+10</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── AUX In Bank (single selected AUX) ──────────────────── */}
      {activeBank === 'auxin' && (
        <div>
          <div className="mb-3">
            <label className="text-xs text-zinc-500 mr-2 uppercase tracking-wider font-medium">AUX</label>
            <select
              value={selectedAuxIn}
              onChange={(e) => setSelectedAuxIn(Number(e.target.value))}
              className="bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-emerald-600 w-full sm:w-auto"
            >
              {[1,2,3,4,5,6].map((a) => (
                <option key={a} value={a}>AUX In {a}</option>
              ))}
            </select>
          </div>
          {(() => {
            const a = selectedAuxIn;
            const isMuted = auxInMutes.get(a) ?? false;
            const fader = auxInFaders.get(a) ?? 0.75;
            return (
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base font-semibold text-zinc-200">AUX In {a}</span>
                  <button
                    onClick={() => putAuxInMute(a, !isMuted)}
                    className={`text-sm font-medium px-5 py-1.5 rounded-lg transition-colors ${
                      isMuted
                        ? 'bg-red-900/50 text-red-300 hover:bg-red-800/50 ring-1 ring-red-700'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                  >
                    {isMuted ? 'Muted' : 'Mute'}
                  </button>
                </div>
                <div className="mb-2">
                  <FaderSlider value={fader} onChange={(v) => putAuxInFader(a, v)} muted={isMuted} size="large" />
                </div>
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>-∞</span>
                  <span className="tabular-nums font-medium text-zinc-300">{fader.toFixed(2)}</span>
                  <span>+10</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── DCA Bank (single selected DCA) ──────────────────────── */}
      {activeBank === 'dcas' && (
        <div>
          {/* DCA selector dropdown */}
          <div className="mb-3">
            <label className="text-xs text-zinc-500 mr-2 uppercase tracking-wider font-medium">
              DCA
            </label>
            <select
              value={selectedDca}
              onChange={(e) => setSelectedDca(Number(e.target.value))}
              className="bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-emerald-600 w-full sm:w-auto"
            >
              {[1,2,3,4,5,6,7,8].map((dca) => (
                <option key={dca} value={dca}>DCA {dca}</option>
              ))}
            </select>
          </div>

          {/* Selected DCA detail */}
          {(() => {
            const dca = selectedDca;
            const isMuted = dcaMutes.get(dca) ?? false;
            const fader = dcaFaders.get(dca) ?? 0.75;

            return (
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base font-semibold text-zinc-200">DCA {dca}</span>
                  <button
                    onClick={() => putDcaMute(dca, !isMuted)}
                    className={`text-sm font-medium px-5 py-1.5 rounded-lg transition-colors ${
                      isMuted
                        ? 'bg-red-900/50 text-red-300 hover:bg-red-800/50 ring-1 ring-red-700'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                  >
                    {isMuted ? 'Muted' : 'Mute'}
                  </button>
                </div>

                <div className="mb-2">
                  <FaderSlider
                    value={fader}
                    onChange={(v) => putDcaFader(dca, v)}
                    muted={isMuted}
                    size="large"
                  />
                </div>

                <div className="flex justify-between text-xs text-zinc-500">
                  <span>-∞</span>
                  <span className="tabular-nums font-medium text-zinc-300">{fader.toFixed(2)}</span>
                  <span>+10</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Main Bank ───────────────────────────────────────────── */}
      {activeBank === 'main' && (
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-base font-semibold text-zinc-200">Main Output</span>
            <span className="text-xs text-zinc-500 tabular-nums">{mainFader.toFixed(2)}</span>
          </div>

          <div className="mb-4">
            <FaderSlider value={mainFader} onChange={putMainFader} muted={mainMuted} size="large" />
          </div>

          <div className="flex justify-between text-xs text-zinc-500 mb-4">
            <span>-∞</span>
            <span>+10</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => putMainMute(true)}
              className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
                mainMuted
                  ? 'bg-red-800/50 text-red-200 ring-1 ring-red-700'
                  : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
              }`}
            >
              Mute
            </button>
            <button
              onClick={() => putMainMute(false)}
              className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
                !mainMuted
                  ? 'bg-emerald-800/50 text-emerald-200 ring-1 ring-emerald-700'
                  : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
              }`}
            >
              Active
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
