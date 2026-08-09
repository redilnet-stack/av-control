import { useEffect, useState, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';

// ── Types ──────────────────────────────────────────────────────────

interface VideohubInputInfo {
  inputId: number;
  label: string;
}

interface VideohubOutputInfo {
  outputId: number;
  label: string;
  routedInput: number;
}

interface VideohubState {
  connected: boolean;
  modelName: string;
  videoInputs: number;
  videoOutputs: number;
  inputs: VideohubInputInfo[];
  outputs: VideohubOutputInfo[];
  protocolVersion: string;
}

// ── InlineLabelEdit Component ──────────────────────────────────────

function InlineLabelEdit({
  label,
  portType,
  portId,
  onSave,
}: {
  label: string;
  portType: 'input' | 'output';
  portId: number;
  onSave: (portType: 'input' | 'output', portId: number, label: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setValue(label);
  }, [label, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== label) {
      await onSave(portType, portId, trimmed);
    }
    setEditing(false);
  }, [value, label, portType, portId, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') setEditing(false);
    },
    [commit],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        maxLength={32}
        className="w-full bg-zinc-700 text-zinc-200 text-xs rounded px-1 py-0.5 border border-amber-600 outline-none min-w-0"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group/edit inline-flex items-center gap-1 hover:text-zinc-100 transition-colors text-left max-w-full"
      title="Click to rename"
    >
      <span className="truncate">{label}</span>
      <svg
        className="w-3 h-3 text-zinc-700 group-hover/edit:text-zinc-500 shrink-0 transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );
}

// ── VideohubPanel Component ────────────────────────────────────────

export function VideohubPanel({
  socket,
  connected: _connected,
}: {
  socket: React.MutableRefObject<Socket | null>;
  connected: boolean;
}) {
  const [state, setState] = useState<VideohubState | null>(null);
  const [vhConnected, setVhConnected] = useState(false);
  const [selectedOutputId, setSelectedOutputId] = useState<number | null>(null);
  const [pendingRoute, setPendingRoute] = useState<{ output: number; input: number } | null>(null);

  // ── Initial state fetch ──────────────────────────────────────────

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setVhConnected(data.devices?.videohub?.connected ?? false);
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
      if (event.device !== 'videohub') return;

      switch (event.type) {
        case 'videohubState': {
          const st = event.data as VideohubState;
          setState(st);
          setVhConnected(st.connected);
          break;
        }
        case 'connected':
          setVhConnected(true);
          break;
        case 'disconnected':
          setVhConnected(false);
          break;
      }
    }

    s.on('deviceEvent', onEvent);
    return () => {
      s.off('deviceEvent', onEvent);
    };
  }, [socket, _connected]);

  // ── API helpers ──────────────────────────────────────────────────

  const changeRoute = useCallback(async (output: number, input: number) => {
    setPendingRoute({ output, input });
    try {
      await fetch('/api/videohub/route', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output, input }),
      });
    } catch {
      /* ignore */
    } finally {
      setPendingRoute(null);
    }
  }, []);

  const saveLabel = useCallback(async (portType: 'input' | 'output', portId: number, label: string) => {
    await fetch('/api/videohub/label', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portType, portId, label }),
    });
  }, []);

  // ── Derived ──────────────────────────────────────────────────────

  const inputsList = state?.inputs ?? [];
  const outputsList = state?.outputs ?? [];
  const selectedOutput = outputsList.find((o) => o.outputId === selectedOutputId) ?? outputsList[0] ?? null;

  // Auto-select first output when list loads
  useEffect(() => {
    if (outputsList.length > 0 && selectedOutputId === null) {
      setSelectedOutputId(outputsList[0].outputId);
    }
  }, [outputsList, selectedOutputId]);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Videohub Routing</h2>
          {state?.modelName && (
            <p className="text-[11px] text-zinc-500 mt-0.5">{state.modelName}</p>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            vhConnected
              ? 'bg-emerald-900/40 text-emerald-300'
              : 'bg-red-900/40 text-red-300'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              vhConnected ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {vhConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Empty states */}
      {(!state || outputsList.length === 0) && vhConnected && (
        <div className="bg-zinc-800/50 rounded-lg py-6 mb-4 text-center text-xs text-zinc-500 border border-dashed border-zinc-700">
          Waiting for routing data from Videohub...
        </div>
      )}

      {outputsList.length === 0 && !vhConnected && (
        <div className="bg-zinc-800/50 rounded-lg py-6 mb-4 text-center text-xs text-zinc-500 border border-dashed border-zinc-700">
          Connect to a Videohub to see routing
        </div>
      )}

      {/* Routing */}
      {outputsList.length > 0 && (
        <>
          {/* Input legend */}
          <details className="mb-3 group">
            <summary className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium cursor-pointer hover:text-zinc-300 transition-colors select-none">
              Input Sources ({inputsList.length})
            </summary>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
              {inputsList.map((input) => (
                <div
                  key={input.inputId}
                  className="text-[11px] text-zinc-400 truncate px-1.5 py-0.5 rounded hover:bg-zinc-800 flex items-center gap-1"
                >
                  <InlineLabelEdit
                    label={input.label}
                    portType="input"
                    portId={input.inputId}
                    onSave={saveLabel}
                  />
                </div>
              ))}
            </div>
          </details>

          {/* Output selector */}
          <div className="flex items-center gap-2 mb-3">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium shrink-0">
              Output
            </label>
            <select
              value={selectedOutput?.outputId ?? ''}
              onChange={(e) => setSelectedOutputId(Number(e.target.value))}
              className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded-md px-2 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-600 min-w-0"
            >
              {outputsList.map((output) => (
                <option key={output.outputId} value={output.outputId}>
                  {output.label}
                </option>
              ))}
            </select>
          </div>

          {/* Selected output routing */}
          {selectedOutput && (
            <div className="flex items-center gap-2 bg-zinc-800/40 rounded-lg px-3 py-2 border border-zinc-800">
              {/* Output label */}
              <div className="w-28 shrink-0">
                <InlineLabelEdit
                  label={selectedOutput.label}
                  portType="output"
                  portId={selectedOutput.outputId}
                  onSave={saveLabel}
                />
              </div>

              {/* Arrow */}
              <svg
                className="w-3 h-3 text-zinc-600 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>

              {/* Input selector */}
              <select
                value={selectedOutput.routedInput}
                onChange={(e) => changeRoute(selectedOutput.outputId, Number(e.target.value))}
                disabled={!vhConnected || pendingRoute?.output === selectedOutput.outputId}
                className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded-md px-2 py-1 border border-zinc-700 focus:outline-none focus:border-amber-600 disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
              >
                {inputsList.map((input) => (
                  <option key={input.inputId} value={input.inputId}>
                    {input.label}
                  </option>
                ))}
              </select>

              {/* Current route badge */}
              {(() => {
                const routedInput = inputsList.find((i) => i.inputId === selectedOutput.routedInput);
                return routedInput ? (
                  <span className="text-[10px] text-amber-400/70 bg-amber-900/20 px-1.5 py-0.5 rounded shrink-0 font-mono">
                    {selectedOutput.routedInput}
                  </span>
                ) : null;
              })()}
            </div>
          )}

          {/* Stats footer */}
          <div className="mt-3 flex items-center gap-3 text-[10px] text-zinc-600 border-t border-zinc-800 pt-2">
            <span>{state?.videoInputs ?? '?'} inputs</span>
            <span className="text-zinc-700">·</span>
            <span>{state?.videoOutputs ?? '?'} outputs</span>
            {state?.protocolVersion && (
              <>
                <span className="text-zinc-700">·</span>
                <span>Protocol v{state.protocolVersion}</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
