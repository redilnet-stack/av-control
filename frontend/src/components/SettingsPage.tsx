import { useEffect, useState, type FormEvent } from 'react';
import type { Settings } from '../types.js';

let _tvIdCounter = 0;
function generateTvId(): string {
  _tvIdCounter++;
  return `tv-${_tvIdCounter}`;
}

const EMPTY: Settings = {
  mockDevices: false,
  zoom: {
    enabled: false,
    s2sClientId: '',
    s2sClientSecret: '',
    accountId: '',
    sdkKey: '',
    sdkSecret: '',
  },
  x32: { host: '', port: 10023, enabled: true },
  atem: { host: '', port: 9910, enabled: false },
  videohub: { host: '', port: 9990, enabled: false },
  broadlink: { host: '', autoDiscover: true, enabled: false },
  tvOutlets: [],
  ampOutlet: { type: 'tapo', host: '', enabled: false },
  projector: {
    enabled: false,
    irCodes: { powerOn: '', powerOff: '', hdmi1: '', hdmi2: '', hdmi3: '', blank: '' },
  },
  screen: {
    enabled: false,
    upStopDelay: 3,
    irCodes: { up: '', down: '', stop: '' },
  },
  tapo: { email: '', password: '' },
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

/** A single IR code row with label, hex display, and learn button. */
function IrCodeRow({
  label,
  code,
  onCodeChange,
  onLearn,
  learning,
  disabled,
}: {
  label: string;
  code: string;
  onCodeChange: (v: string) => void;
  onLearn: () => void;
  learning: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-20 shrink-0 pt-1.5">
        <span className="text-[11px] text-zinc-400">{label}</span>
      </div>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder="Hex code or leave empty"
          className="w-full px-2 py-1 text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
        />
      </div>
      <button
        type="button"
        onClick={onLearn}
        disabled={disabled || learning}
        className="shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-md bg-amber-800 hover:bg-amber-700 disabled:opacity-40 text-amber-200 transition-colors"
      >
        {learning ? '...' : 'Learn'}
      </button>
    </div>
  );
}

/** IR code section for a device type (projector or screen). */
function IrCodeSection({
  title,
  label,
  enabled,
  irCodes,
  onEnabledChange,
  onIrCodeChange,
  onLearn,
  learningKey,
  disabled,
  commandLabels,
  children,
}: {
  title: string;
  label: string;
  enabled: boolean;
  irCodes: Record<string, string>;
  onEnabledChange: (v: boolean) => void;
  onIrCodeChange: (key: string, value: string) => void;
  onLearn: (key: string) => void;
  learningKey: string | null;
  disabled: boolean;
  commandLabels: Record<string, string>;
  children?: React.ReactNode;
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

      {children}

      {!disabled && (
        <p className="text-[10px] text-zinc-600 mb-3">
          Point the remote at the Broadlink IR blaster and click <strong>Learn</strong> for each button,
          then press the corresponding button on your remote within 15 seconds.
        </p>
      )}

      <div className="space-y-2">
        {Object.entries(irCodes).map(([key, code]) => (
          <IrCodeRow
            key={key}
            label={commandLabels[key] ?? key}
            code={code}
            onCodeChange={(v) => onIrCodeChange(key, v)}
            onLearn={() => onLearn(key)}
            learning={learningKey === key}
            disabled={disabled}
          />
        ))}
      </div>
    </fieldset>
  );
}

// ── Main Settings Page ──────────────────────────────────────────────

export function SettingsPage({ onNavigate }: { onNavigate: () => void }) {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testingX32, setTestingX32] = useState(false);
  const [testingAtem, setTestingAtem] = useState(false);
  const [testingVideohub, setTestingVideohub] = useState(false);
  const [testingBroadlink, setTestingBroadlink] = useState(false);
  const [learningKey, setLearningKey] = useState<string | null>(null);

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

  // ── Test helpers ─────────────────────────────────────────────────

  async function testVideohub() {
    setTestingVideohub(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: 'videohub', host: settings.videohub.host, port: settings.videohub.port }),
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
      setTestingVideohub(false);
    }
  }

  async function testAtem() {
    setTestingAtem(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: 'atem', host: settings.atem.host, port: settings.atem.port }),
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
      setTestingAtem(false);
    }
  }

  async function testX32() {
    setTestingX32(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: 'x32', host: settings.x32.host, port: settings.x32.port }),
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

  async function testBroadlink() {
    setTestingBroadlink(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: 'broadlink', host: settings.broadlink.host, port: 80 }),
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
      setTestingBroadlink(false);
    }
  }

  // ── IR Learning ──────────────────────────────────────────────────

  async function learnIrCode(device: 'projector' | 'screen', command: string) {
    setLearningKey(`${device}:${command}`);
    setMessage(null);
    try {
      const res = await fetch('/api/projector/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device, command }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ ok: true, text: `IR code learned for ${device}.${command}` });
        // Update local settings with the learned code
        if (device === 'projector') {
          setSettings((prev) => ({
            ...prev,
            projector: {
              ...prev.projector,
              irCodes: { ...prev.projector.irCodes, [command]: data.code },
            },
          }));
        } else {
          setSettings((prev) => ({
            ...prev,
            screen: {
              ...prev.screen,
              irCodes: { ...prev.screen.irCodes, [command]: data.code },
            },
          }));
        }
        // Auto-save after learning
        await saveSettings();
      } else {
        setMessage({ ok: false, text: data.error || 'Learning failed' });
      }
    } catch {
      setMessage({ ok: false, text: 'Learning request failed — is the Broadlink connected?' });
    } finally {
      setLearningKey(null);
    }
  }

  // ── Loading state ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        Loading settings...
      </div>
    );
  }

  // ── IR code label maps ───────────────────────────────────────────

  const projectorLabels: Record<string, string> = {
    powerOn: 'Power On',
    powerOff: 'Power Off',
    hdmi1: 'HDMI 1',
    hdmi2: 'HDMI 2',
    hdmi3: 'HDMI 3',
    blank: 'Blank / Mute',
  };

  const screenLabels: Record<string, string> = {
    up: 'Up',
    down: 'Down',
    stop: 'Stop',
  };

  // ── Render ───────────────────────────────────────────────────────

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
          onTest={testAtem}
          testing={testingAtem}
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
          onTest={testVideohub}
          testing={testingVideohub}
        />

        <DeviceSection
          title="Broadlink RM4"
          label="IR Remote / Blaster"
          host={settings.broadlink.host}
          enabled={settings.broadlink.enabled}
          showPort={false}
          onHostChange={(v) => setSettings({ ...settings, broadlink: { ...settings.broadlink, host: v } })}
          onEnabledChange={(v) => setSettings({ ...settings, broadlink: { ...settings.broadlink, enabled: v } })}
          onTest={testBroadlink}
          testing={testingBroadlink}
        />

        <IrCodeSection
          title="Projector IR Codes"
          label={settings.labels.projector || 'Projector'}
          enabled={settings.projector.enabled}
          irCodes={settings.projector.irCodes}
          onEnabledChange={(v) => setSettings({ ...settings, projector: { ...settings.projector, enabled: v } })}
          onIrCodeChange={(key, value) =>
            setSettings({
              ...settings,
              projector: { ...settings.projector, irCodes: { ...settings.projector.irCodes, [key]: value } },
            })
          }
          onLearn={(key) => learnIrCode('projector', key)}
          learningKey={learningKey?.startsWith('projector:') ? learningKey.split(':')[1] : null}
          disabled={!settings.broadlink.enabled}
          commandLabels={projectorLabels}
        />

        <IrCodeSection
          title="Screen IR Codes"
          label={settings.labels.screen || 'Projector Screen'}
          enabled={settings.screen.enabled}
          irCodes={settings.screen.irCodes}
          onEnabledChange={(v) => setSettings({ ...settings, screen: { ...settings.screen, enabled: v } })}
          onIrCodeChange={(key, value) =>
            setSettings({
              ...settings,
              screen: { ...settings.screen, irCodes: { ...settings.screen.irCodes, [key]: value } },
            })
          }
          onLearn={(key) => learnIrCode('screen', key)}
          learningKey={learningKey?.startsWith('screen:') ? learningKey.split(':')[1] : null}
          disabled={!settings.broadlink.enabled}
          commandLabels={screenLabels}
        >
          {/* Auto-stop delay setting */}
          <div className="flex items-center gap-2 mb-3 bg-zinc-800/40 rounded-md px-3 py-2">
            <label className="text-[11px] text-zinc-400 shrink-0">
              Auto-stop after raising:
            </label>
            <input
              type="number"
              min={0}
              max={60}
              value={settings.screen.upStopDelay}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  screen: { ...settings.screen, upStopDelay: Math.max(0, parseInt(e.target.value, 10) || 0) },
                })
              }
              className="w-16 px-2 py-1 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 text-center focus:outline-none focus:border-emerald-600 transition-colors"
            />
            <span className="text-[11px] text-zinc-500">seconds</span>
          </div>
        </IrCodeSection>

        {/* ── Zoom Credentials ────────────────────────────────── */}
        <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <legend className="text-sm font-semibold text-zinc-300 px-1.5">
            Zoom Integration
          </legend>
          <p className="text-[11px] text-zinc-600 mb-3">
            Enter credentials from your Zoom Marketplace apps. Requires a Server-to-Server OAuth app
            and a Meeting SDK app. See the Zoom developer docs for setup instructions.
          </p>

          <div className="space-y-3">
            {/* S2S Client ID */}
            <div>
              <label className="block text-[11px] text-zinc-500 mb-0.5">Server-to-Server Client ID</label>
              <input
                type="text"
                value={settings.zoom.s2sClientId}
                onChange={(e) => setSettings({ ...settings, zoom: { ...settings.zoom, s2sClientId: e.target.value } })}
                placeholder="Zoom S2S OAuth Client ID"
                className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors font-mono text-xs"
              />
            </div>

            {/* S2S Client Secret */}
            <div>
              <label className="block text-[11px] text-zinc-500 mb-0.5">Server-to-Server Client Secret</label>
              <input
                type="password"
                value={settings.zoom.s2sClientSecret}
                onChange={(e) => setSettings({ ...settings, zoom: { ...settings.zoom, s2sClientSecret: e.target.value } })}
                placeholder="Zoom S2S OAuth Client Secret"
                className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors font-mono text-xs"
              />
            </div>

            {/* Account ID */}
            <div>
              <label className="block text-[11px] text-zinc-500 mb-0.5">Account ID</label>
              <input
                type="text"
                value={settings.zoom.accountId}
                onChange={(e) => setSettings({ ...settings, zoom: { ...settings.zoom, accountId: e.target.value } })}
                placeholder="Zoom Account ID"
                className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors font-mono text-xs"
              />
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-800 pt-3">
              <p className="text-[11px] text-zinc-500 mb-2">Meeting SDK (for in-browser audio/video)</p>
            </div>

            {/* SDK Key */}
            <div>
              <label className="block text-[11px] text-zinc-500 mb-0.5">SDK Key</label>
              <input
                type="text"
                value={settings.zoom.sdkKey}
                onChange={(e) => setSettings({ ...settings, zoom: { ...settings.zoom, sdkKey: e.target.value } })}
                placeholder="Zoom Meeting SDK Key"
                className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors font-mono text-xs"
              />
            </div>

            {/* SDK Secret */}
            <div>
              <label className="block text-[11px] text-zinc-500 mb-0.5">SDK Secret</label>
              <input
                type="password"
                value={settings.zoom.sdkSecret}
                onChange={(e) => setSettings({ ...settings, zoom: { ...settings.zoom, sdkSecret: e.target.value } })}
                placeholder="Zoom Meeting SDK Secret"
                className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors font-mono text-xs"
              />
            </div>
          </div>
        </fieldset>

        {/* ── TV Outlets ────────────────────────────────────────── */}
        <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <legend className="text-sm font-semibold text-zinc-300 px-1.5">
            TV Outlets
          </legend>

          <div className="space-y-3">
            {settings.tvOutlets.map((outlet, idx) => (
              <div
                key={outlet.id}
                className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-400">TV #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        tvOutlets: settings.tvOutlets.filter((_, i) => i !== idx),
                      })
                    }
                    className="text-[11px] px-2 py-0.5 rounded bg-red-900/40 hover:bg-red-800/60 text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1">
                    <label className="block text-[11px] text-zinc-500 mb-0.5">Label</label>
                    <input
                      type="text"
                      value={outlet.label}
                      onChange={(e) => {
                        const updated = [...settings.tvOutlets];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setSettings({ ...settings, tvOutlets: updated });
                      }}
                      placeholder="e.g. Living Room TV"
                      className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 shrink-0 mt-4">
                    <input
                      type="checkbox"
                      checked={outlet.enabled}
                      onChange={(e) => {
                        const updated = [...settings.tvOutlets];
                        updated[idx] = { ...updated[idx], enabled: e.target.checked };
                        setSettings({ ...settings, tvOutlets: updated });
                      }}
                      className="accent-emerald-500"
                    />
                    Enabled
                  </label>
                </div>

                <div className="flex gap-2">
                  <div className="w-28">
                    <label className="block text-[11px] text-zinc-500 mb-0.5">Type</label>
                    <select
                      value={outlet.type}
                      onChange={(e) => {
                        const updated = [...settings.tvOutlets];
                        updated[idx] = { ...updated[idx], type: e.target.value as 'tapo' | 'tasmota' | 'etekcity' };
                        setSettings({ ...settings, tvOutlets: updated });
                      }}
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
                      value={outlet.host}
                      onChange={(e) => {
                        const updated = [...settings.tvOutlets];
                        updated[idx] = { ...updated[idx], host: e.target.value };
                        setSettings({ ...settings, tvOutlets: updated });
                      }}
                      placeholder="e.g. 192.168.1.50"
                      className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setSettings({
                ...settings,
                tvOutlets: [
                  ...settings.tvOutlets,
                  { id: generateTvId(), label: `TV ${settings.tvOutlets.length + 1}`, type: 'tapo' as const, host: '', enabled: false },
                ],
              })
            }
            className="mt-3 w-full px-3 py-2 text-xs font-medium rounded-md border border-dashed border-zinc-700 hover:border-emerald-700 text-zinc-400 hover:text-emerald-400 bg-transparent transition-colors"
          >
            + Add TV
          </button>
        </fieldset>

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

        {/* ── Tapo Cloud Credentials ───────────────────────────── */}
        <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <legend className="text-sm font-semibold text-zinc-300 px-1.5">
            Tapo Cloud Credentials
          </legend>
          <p className="text-[11px] text-zinc-600 mb-3">
            Required for controlling Tapo P100/P110 smart plugs. Use your TP-Link cloud account
            email and password (same as the Tapo/Kasa app).
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-0.5">Tapo Email</label>
              <input
                type="text"
                value={settings.tapo.email}
                onChange={(e) =>
                  setSettings({ ...settings, tapo: { ...settings.tapo, email: e.target.value } })
                }
                placeholder="tapo@example.com"
                className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-0.5">Tapo Password</label>
              <input
                type="password"
                value={settings.tapo.password}
                onChange={(e) =>
                  setSettings({ ...settings, tapo: { ...settings.tapo, password: e.target.value } })
                }
                placeholder="TP-Link cloud password"
                className="w-full px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors font-mono text-xs"
              />
            </div>
          </div>
        </fieldset>

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
