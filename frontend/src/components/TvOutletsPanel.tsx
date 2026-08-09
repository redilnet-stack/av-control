import { useState, useEffect, useCallback } from 'react';

interface OutletState {
  id: string;
  label: string;
  type: string;
  host: string;
  poweredOn: boolean;
  reachable: boolean;
}

interface OutletsResponse {
  outlets: OutletState[];
}

export function TvOutletsPanel() {
  const [outlets, setOutlets] = useState<OutletState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  // Load cached states — no network calls to devices
  const fetchCached = useCallback(async () => {
    try {
      const res = await fetch('/api/outlets');
      const data: OutletsResponse = await res.json();
      setOutlets(data.outlets);
    } catch {
      /* backend not reachable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCached();
  }, [fetchCached]);

  // Refresh live states from devices (triggers cloud auth for Tapo)
  const refreshLive = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/outlets/refresh', { method: 'POST' });
      const data: OutletsResponse = await res.json();
      if (data.outlets) {
        setOutlets(data.outlets);
      }
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, []);

  const sendCommand = useCallback(async (id: string, command: 'on' | 'off') => {
    setSending(`${id}:${command}`);
    try {
      const res = await fetch(`/api/outlets/${id}/${command}`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setOutlets((prev) =>
          prev.map((o) =>
            o.id === id ? { ...o, poweredOn: command === 'on', reachable: true } : o,
          ),
        );
      }
    } catch {
      /* ignore */
    } finally {
      setSending(null);
    }
  }, []);

  const isBusy = sending !== null;

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">TV Outlets</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshLive}
            disabled={refreshing}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 transition-colors"
          >
            {refreshing ? '...' : 'Refresh'}
          </button>
          <span className="text-[11px] text-zinc-500">
            {outlets.length} {outlets.length === 1 ? 'outlet' : 'outlets'}
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-zinc-800/50 rounded-lg py-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-700">
          Loading outlet status...
        </div>
      )}

      {/* No outlets configured */}
      {!loading && outlets.length === 0 && (
        <div className="bg-zinc-800/50 rounded-lg py-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-700">
          No TV outlets configured — add them in Settings
        </div>
      )}

      {/* Outlet cards */}
      {!loading && outlets.length > 0 && (
        <div className="space-y-3">
          {outlets.map((outlet) => (
            <div
              key={outlet.id}
              className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3"
            >
              {/* Outlet header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      outlet.poweredOn
                        ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                        : 'bg-zinc-600'
                    }`}
                  />
                  <span className="text-sm font-medium text-zinc-200">
                    {outlet.label}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    outlet.reachable
                      ? outlet.poweredOn
                        ? 'bg-emerald-900/40 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-400'
                      : 'bg-red-900/40 text-red-300'
                  }`}
                >
                  {outlet.reachable
                    ? outlet.poweredOn
                      ? 'On'
                      : 'Off'
                    : 'Offline'}
                </span>
              </div>

              {/* Power type + info */}
              <div className="text-[10px] text-zinc-600 mb-2 capitalize">
                {outlet.type} &middot; {outlet.host || 'no host set'}
              </div>

              {/* Power buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => sendCommand(outlet.id, 'on')}
                  disabled={isBusy || !outlet.reachable}
                  className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition-colors bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white"
                >
                  {sending === `${outlet.id}:on` ? '...' : 'Power On'}
                </button>
                <button
                  onClick={() => sendCommand(outlet.id, 'off')}
                  disabled={isBusy || !outlet.reachable}
                  className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition-colors bg-red-700 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white"
                >
                  {sending === `${outlet.id}:off` ? '...' : 'Power Off'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
