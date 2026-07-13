import { useEffect, useState, type FormEvent } from 'react';
import type { Settings } from '../types.js';

const EMPTY: Settings = {
  mockDevices: false,
  x32: { host: '', port: 10023, enabled: true },
  atem: { host: '', port: 9990, enabled: false },
  videohub: { host: '', port: 9990, enabled: false },
  broadlink: { host: '', autoDiscover: true, enabled: false },
  tvOutlet: { type: 'tapo', host: '', enabled: false },
  ampOutlet: { type: 'tapo', host: '', enabled: false },
  labels: {},
};

function DeviceSection({
  title,
  label,
  host,
  port,
  enabled,
  onHostChange,
  onPortChange,
  onEnabledChange,
  showPort = true,
  onTest,
  testing,
}: {
  title: string;
  label: string;
  host: string;
  port?: number;
  enabled: boolean;
  onHostChange: (v: string) => void;
  onPortChange?: (v: number) => void;
  onEnabledChange: (v: boolean) => void;
  showPort?: boolean;
  onTest?: () => void;
  testing?: boolean;
}) {
  return (
    <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <legend className="text-sm font-semibold text-zinc-300 px-1.5">
        {title}
      </legend>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-500">{label}</span>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="accent-emerald-500"
          />
          Enabled
        </label>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[11px] text-zinc-500 mb-0.5">Host / IP</label>
          <input
            type="text"
            value={host}
            onChange={(e) => onHostChange(e.target.value)}
            placeholder="e.g. 192.168.1.100"
            className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
          />
        </div>
        {showPort && onPortChange && (
          <div className="w-24">
            <label className="block text-[11px] text-zinc-500 mb-0.5">Port</label>
            <input
              type="number"
              value={port ?? 0}
              onChange={(e) => onPortChange(parseInt(e.target.value, 10) || 0)}
              className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:border-emerald-600 transition-colors"
            />
          </div>
        )}
        {onTest && (
          <div className="self-end">
            <button
              type="button"
              onClick={onTest}
              disabled={testing || !host}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 transition-colors"
            >
              {testing ? '...' : 'Test'}
            </button>
          </div>
        )}
      </div>
    </fieldset>
  );
}

function OutletSection({
  title,
  label,
  type,
  host,
  enabled,
  onTypeChange,
  onHostChange,
  onEnabledChange,
}: {
  title: string;
  label: string;
  type: string;
  host: string;
  enabled: boolean;
  onTypeChange: (v: string) => void;
  onHostChange: (v: string) => void;
  onEnabledChange: (v: boolean) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <legend className="text-sm font-semibold text-zinc-300 px-1.5">
        {title}
      </legend>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-500">{label}</span>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="accent-emerald-500"
          />
          Enabled
        </label>
      </div>

      <div className="flex gap-2">
        <div className="w-28">
          <label className="block text-[11px] text-zinc-500 mb-0.5">Type</label>
          <select
            value={type}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:border-emerald-600"
          >
            <option value="tapo">Tapo</option>
            <option value="tasmota">Tasmota</option>
            <option value="etekcity">Etekcity</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[11px] text-zinc-500 mb-0.5">Host / IP</label>
          <input
            type="text"
            value={host}
            onChange={(e) => onHostChange(e.target.value)}
            placeholder="e.g. 192.168.1.50"
            className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
          />
        </div>
      </div>
    </fieldset>
  );
}

export function SettingsPage({ onNavigate }: { onNavigate: () => void }) {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testingX32, setTestingX32] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings({ ...EMPTY, ...data });
        setLoading(false);
      })
      .catch(() => {
        setMessage({ ok: false, text: 'Failed to load settings — is the backend running?' });
        setLoading(false);
      });
  }, []);

  async function saveSettings(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ ok: true, text: 'Settings saved successfully' });
        return true;
      } else {
        setMessage({ ok: false, text: data.error || 'Save failed' });
        return false;
      }
    } catch {
      setMessage({ ok: false, text: 'Network error — could not reach backend' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    await saveSettings();
  }

  async function testX32() {
    setTestingX32(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device: 'x32',
          host: settings.x32.host,
          port: settings.x32.port,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ ok: true, text: 'Connection OK — saving settings...' });
        await saveSettings();
      } else {
        setMessage({ ok: false, text: data.message });
      }
    } catch {
      setMessage({ ok: false, text: 'Test request failed' });
    } finally {
      setTestingX32(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Device Settings</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configure IP addresses and ports for all AV equipment
          </p>
        </div>
        <button
          onClick={onNavigate}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 px-3 py-2 rounded-md text-sm ${
            message.ok
              ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-800'
              : 'bg-red-900/30 text-red-300 border border-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        {/* Mock mode toggle */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-zinc-300">Mock Mode</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Simulate all devices for testing
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.mockDevices}
              onChange={(e) =>
                setSettings({ ...settings, mockDevices: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-700 rounded-full peer-checked:bg-emerald-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
          </label>
        </div>

        <DeviceSection
          title="X32 Mixer"
          label={settings.labels.x32 || 'Digital Mixer'}
          host={settings.x32.host}
          port={settings.x32.port}
          enabled={settings.x32.enabled}
          onHostChange={(v) => setSettings({ ...settings, x32: { ...settings.x32, host: v } })}
          onPortChange={(v) => setSettings({ ...settings, x32: { ...settings.x32, port: v } })}
          onEnabledChange={(v) => setSettings({ ...settings, x32: { ...settings.x32, enabled: v } })}
          onTest={testX32}
          testing={testingX32}
        />

        <DeviceSection
          title="ATEM Switcher"
          label={settings.labels.atem || 'Blackmagic ATEM'}
          host={settings.atem.host}
          port={settings.atem.port}
          enabled={settings.atem.enabled}
          onHostChange={(v) => setSettings({ ...settings, atem: { ...settings.atem, host: v } })}
          onPortChange={(v) => setSettings({ ...settings, atem: { ...settings.atem, port: v } })}
          onEnabledChange={(v) => setSettings({ ...settings, atem: { ...settings.atem, enabled: v } })}
        />

        <DeviceSection
          title="Videohub"
          label={settings.labels.videohub || 'Blackmagic Videohub'}
          host={settings.videohub.host}
          port={settings.videohub.port}
          enabled={settings.videohub.enabled}
          onHostChange={(v) => setSettings({ ...settings, videohub: { ...settings.videohub, host: v } })}
          onPortChange={(v) => setSettings({ ...settings, videohub: { ...settings.videohub, port: v } })}
          onEnabledChange={(v) => setSettings({ ...settings, videohub: { ...settings.videohub, enabled: v } })}
        />

        <DeviceSection
          title="Broadlink RM4"
          label="IR Remote"
          host={settings.broadlink.host}
          enabled={settings.broadlink.enabled}
          showPort={false}
          onHostChange={(v) => setSettings({ ...settings, broadlink: { ...settings.broadlink, host: v } })}
          onEnabledChange={(v) => setSettings({ ...settings, broadlink: { ...settings.broadlink, enabled: v } })}
        />

        <OutletSection
          title="TV Outlet"
          label={settings.labels.tv || 'Samsung TV'}
          type={settings.tvOutlet.type}
          host={settings.tvOutlet.host}
          enabled={settings.tvOutlet.enabled}
          onTypeChange={(v) => setSettings({ ...settings, tvOutlet: { ...settings.tvOutlet, type: v as 'tapo' | 'tasmota' | 'etekcity' } })}
          onHostChange={(v) => setSettings({ ...settings, tvOutlet: { ...settings.tvOutlet, host: v } })}
          onEnabledChange={(v) => setSettings({ ...settings, tvOutlet: { ...settings.tvOutlet, enabled: v } })}
        />

        <OutletSection
          title="Amp Outlet"
          label={settings.labels.amp || 'NU4-6000 Amp'}
          type={settings.ampOutlet.type}
          host={settings.ampOutlet.host}
          enabled={settings.ampOutlet.enabled}
          onTypeChange={(v) => setSettings({ ...settings, ampOutlet: { ...settings.ampOutlet, type: v as 'tapo' | 'tasmota' | 'etekcity' } })}
          onHostChange={(v) => setSettings({ ...settings, ampOutlet: { ...settings.ampOutlet, host: v } })}
          onEnabledChange={(v) => setSettings({ ...settings, ampOutlet: { ...settings.ampOutlet, enabled: v } })}
        />

        {/* Save */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
