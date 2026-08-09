import { useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';

// ── Types ──────────────────────────────────────────────────────────

interface AtemInputInfo {
  inputId: number;
  longName: string;
  shortName: string;
}

interface AtemState {
  connected: boolean;
  programInput: number;
  previewInput: number;
  transitionPosition: number;
  transitionInTransition: boolean;
  meCount: number;
  inputs: AtemInputInfo[];
}

// ── AtemPanel Component ────────────────────────────────────────────

export function AtemPanel({
  socket,
  connected: _connected,
}: {
  socket: React.MutableRefObject<Socket | null>;
  connected: boolean;
}) {
  const [inputs, setInputs] = useState<AtemInputInfo[]>([]);
  const [programInput, setProgramInput] = useState(0);
  const [previewInput, setPreviewInput] = useState(0);
  const [atemConnected, setAtemConnected] = useState(false);
  const [inTransition, setInTransition] = useState(false);

  // ── Initial state fetch ──────────────────────────────────────────

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setAtemConnected(data.devices?.atem?.connected ?? false);
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
      if (event.device !== 'atem') return;

      switch (event.type) {
        case 'atemState': {
          const state = event.data as AtemState;
          setInputs(state.inputs);
          setProgramInput(state.programInput);
          setPreviewInput(state.previewInput);
          setAtemConnected(state.connected);
          setInTransition(state.transitionInTransition);
          break;
        }
        case 'connected':
          setAtemConnected(true);
          break;
        case 'disconnected':
          setAtemConnected(false);
          break;
        case 'programInput': {
          const { inputId } = event.data as { inputId: number };
          setProgramInput(inputId);
          break;
        }
        case 'previewInput': {
          const { inputId } = event.data as { inputId: number };
          setPreviewInput(inputId);
          break;
        }
      }
    }

    s.on('deviceEvent', onEvent);
    return () => {
      s.off('deviceEvent', onEvent);
    };
  }, [socket, _connected]);

  // ── API helpers ──────────────────────────────────────────────────

  const putProgram = useCallback(async (inputId: number) => {
    await fetch('/api/atem/program', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputId }),
    });
  }, []);

  const putPreview = useCallback(async (inputId: number) => {
    await fetch('/api/atem/preview', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputId }),
    });
  }, []);

  const postCut = useCallback(async () => {
    await fetch('/api/atem/cut', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  }, []);

  const postAuto = useCallback(async () => {
    await fetch('/api/atem/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  }, []);

  // ── Derived ──────────────────────────────────────────────────────

  const visibleInputs = inputs.filter((i) => i.inputId > 0);
  const programName = inputs.find((i) => i.inputId === programInput)?.longName ?? `Input ${programInput}`;
  const previewName = inputs.find((i) => i.inputId === previewInput)?.longName ?? `Input ${previewInput}`;

  const disabled = !atemConnected || inTransition;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">ATEM Switcher</h2>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            atemConnected
              ? 'bg-emerald-900/40 text-emerald-300'
              : 'bg-red-900/40 text-red-300'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              atemConnected ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {atemConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* No inputs placeholder */}
      {visibleInputs.length === 0 && atemConnected && (
        <div className="bg-zinc-800/50 rounded-lg py-6 mb-4 text-center text-xs text-zinc-500 border border-dashed border-zinc-700">
          Waiting for input list from switcher...
        </div>
      )}

      {visibleInputs.length === 0 && !atemConnected && (
        <div className="bg-zinc-800/50 rounded-lg py-6 mb-4 text-center text-xs text-zinc-500 border border-dashed border-zinc-700">
          Connect to an ATEM switcher to see inputs
        </div>
      )}

      {/* Program / Preview dropdowns */}
      {visibleInputs.length > 0 && (
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">
              Program
            </label>
            <div className="flex gap-2">
              <select
                value={programInput}
                onChange={(e) => putProgram(Number(e.target.value))}
                disabled={disabled}
                className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {visibleInputs.map((input) => (
                  <option key={input.inputId} value={input.inputId}>
                    {input.shortName} — {input.longName}
                  </option>
                ))}
              </select>
              <div className="w-2 h-2 rounded-full bg-emerald-400 self-center shrink-0" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">
              Preview
            </label>
            <div className="flex gap-2">
              <select
                value={previewInput}
                onChange={(e) => putPreview(Number(e.target.value))}
                disabled={disabled}
                className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {visibleInputs.map((input) => (
                  <option key={input.inputId} value={input.inputId}>
                    {input.shortName} — {input.longName}
                  </option>
                ))}
              </select>
              <div className="w-2 h-2 rounded-full bg-sky-400 self-center shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* Current state readout */}
      {visibleInputs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-emerald-900/20 rounded-lg p-2.5 border border-emerald-800/50">
            <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium mb-0.5">
              Active Program
            </div>
            <div className="text-sm font-semibold text-emerald-200 truncate">
              {programName}
            </div>
          </div>
          <div className="bg-sky-900/20 rounded-lg p-2.5 border border-sky-800/50">
            <div className="text-[10px] text-sky-400 uppercase tracking-wider font-medium mb-0.5">
              Next Preview
            </div>
            <div className="text-sm font-semibold text-sky-200 truncate">
              {previewName}
            </div>
          </div>
        </div>
      )}

      {/* Transition controls */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">
          Transitions
        </div>
        <div className="flex gap-2">
          <button
            onClick={postCut}
            disabled={disabled}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors bg-red-700 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white"
          >
            Cut
          </button>
          <button
            onClick={postAuto}
            disabled={disabled}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors bg-sky-700 hover:bg-sky-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white"
          >
            {inTransition ? 'Transitioning...' : 'Auto'}
          </button>
        </div>
      </div>
    </div>
  );
}
