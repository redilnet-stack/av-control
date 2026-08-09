import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import type { AppSettings } from '../../config/settings-schema.js';
import type { X32DriverHandle } from '../x32/driver-interface.js';
import { createX32Driver, X32Driver } from '../x32/index.js';
import { MockX32Driver } from '../x32/mock.js';
import type { AtemDriverHandle } from '../atem/driver-interface.js';
import { createAtemDriver, AtemDriver } from '../atem/index.js';
import { MockAtemDriver } from '../atem/mock.js';
import type { VideohubDriverHandle } from '../videohub/driver-interface.js';
import { VideohubDriver } from '../videohub/videohub.js';
import { MockVideohubDriver } from '../videohub/mock.js';
import { BroadlinkService } from '../broadlink/broadlink-service.js';
import { MockBroadlinkService } from '../broadlink/mock.js';
import { broadcastDeviceEvent } from '../../api/websocket.js';

/**
 * Manages the lifecycle of all device drivers.
 * Handles connect / disconnect / reconnect when settings change.
 */
export class DeviceManager extends EventEmitter {
  private x32: X32DriverHandle | null = null;
  private atem: AtemDriverHandle | null = null;
  private videohub: VideohubDriverHandle | null = null;
  private broadlink: BroadlinkService | MockBroadlinkService | null = null;
  private currentSettings: AppSettings | null = null;

  /** Initialise (or re-initialise) all devices from settings. */
  async applySettings(settings: AppSettings): Promise<void> {
    const prev = this.currentSettings;
    this.currentSettings = settings;

    const tasks: Promise<void>[] = [];

    if (settings.mockDevices) {
      logger.info('Mock mode enabled — connecting simulated devices');
      await this.disconnectAll();
      this.x32 = new MockX32Driver();
      await this.x32.connect();
      this.hookX32Events();
      this.atem = new MockAtemDriver();
      await this.atem.connect();
      this.hookAtemEvents();
      this.videohub = new MockVideohubDriver();
      await this.videohub.connect();
      this.hookVideohubEvents();
      this.broadlink = new MockBroadlinkService();
      await this.broadlink.connect();
      this.hookBroadlinkEvents();
      return;
    }

    // X32
    const x32Changed =
      prev?.devices.x32.host !== settings.devices.x32.host ||
      prev?.devices.x32.port !== settings.devices.x32.port ||
      prev?.devices.x32.enabled !== settings.devices.x32.enabled;

    if (x32Changed) {
      tasks.push(this.reconnectX32(settings));
    }

    // Videohub
    const videohubChanged =
      prev?.devices.videohub.host !== settings.devices.videohub.host ||
      prev?.devices.videohub.port !== settings.devices.videohub.port ||
      prev?.devices.videohub.enabled !== settings.devices.videohub.enabled;

    if (videohubChanged) {
      tasks.push(this.reconnectVideohub(settings));
    }

    // ATEM
    const atemChanged =
      prev?.devices.atem.host !== settings.devices.atem.host ||
      prev?.devices.atem.port !== settings.devices.atem.port ||
      prev?.devices.atem.enabled !== settings.devices.atem.enabled;

    if (atemChanged) {
      tasks.push(this.reconnectAtem(settings));
    }

    // Broadlink
    const broadlinkChanged =
      prev?.devices.broadlink.host !== settings.devices.broadlink.host ||
      prev?.devices.broadlink.enabled !== settings.devices.broadlink.enabled;

    if (broadlinkChanged) {
      tasks.push(this.reconnectBroadlink(settings));
    }

    await Promise.allSettled(tasks);
  }

  /** Access the X32 driver handle (or null if not connected). */
  getX32(): X32DriverHandle | null {
    return this.x32;
  }

  /** Access the ATEM driver handle (or null if not connected). */
  getAtem(): AtemDriverHandle | null {
    return this.atem;
  }

  /** Access the Videohub driver handle (or null if not connected). */
  getVideohub(): VideohubDriverHandle | null {
    return this.videohub;
  }

  /** Access the Broadlink service (or null if not connected). */
  getBroadlink(): BroadlinkService | MockBroadlinkService | null {
    return this.broadlink;
  }

  /** Get status of all managed devices. */
  getStatus() {
    return {
      x32: {
        connected: this.x32?.connected ?? false,
        enabled: this.currentSettings?.devices.x32.enabled ?? false,
        mock: this.currentSettings?.mockDevices ?? false,
      },
      atem: {
        connected: this.atem?.connected ?? false,
        enabled: this.currentSettings?.devices.atem.enabled ?? false,
        mock: this.currentSettings?.mockDevices ?? false,
      },
      videohub: {
        connected: this.videohub?.connected ?? false,
        enabled: this.currentSettings?.devices.videohub.enabled ?? false,
        mock: this.currentSettings?.mockDevices ?? false,
      },
      broadlink: {
        connected: this.broadlink?.connected ?? false,
        enabled: this.currentSettings?.devices.broadlink.enabled ?? false,
        mock: this.currentSettings?.mockDevices ?? false,
      },
    };
  }

  /** Disconnect all devices. */
  async disconnectAll(): Promise<void> {
    if (this.x32) {
      try { await this.x32.disconnect(); } catch { /* ignore */ }
      this.x32 = null;
    }
    if (this.atem) {
      try { await this.atem.disconnect(); } catch { /* ignore */ }
      this.atem = null;
    }
    if (this.videohub) {
      try { await this.videohub.disconnect(); } catch { /* ignore */ }
      this.videohub = null;
    }
    if (this.broadlink) {
      try { await this.broadlink.disconnect(); } catch { /* ignore */ }
      this.broadlink = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────────

  // ── X32 ─────────────────────────────────────────────────────────────

  private async reconnectX32(settings: AppSettings): Promise<void> {
    const cfg = settings.devices.x32;

    if (this.x32) {
      try { await this.x32.disconnect(); } catch { /* ignore */ }
      this.x32 = null;
    }

    if (!cfg.enabled) {
      logger.info('X32 disabled in settings');
      return;
    }

    if (!cfg.host) {
      logger.warn('X32 host not set — skipping connect');
      return;
    }

    try {
      const driver = new X32Driver({ host: cfg.host, port: cfg.port });
      this.x32 = driver;
      await driver.connect();
      this.hookX32Events();
      logger.info('X32 reconnected', { host: cfg.host, port: cfg.port });
    } catch (err) {
      logger.error('Failed to connect X32', {
        host: cfg.host,
        error: (err as Error).message,
      });
      this.x32 = null;
    }
  }

  private hookX32Events(): void {
    const d = this.x32;
    if (!d) return;

    d.removeAllListeners();
    d.on('meter', (data: unknown) => {
      broadcastDeviceEvent('x32', 'meter', data);
    });
    d.on('channelMute', (channel: unknown, muted: unknown) => {
      logger.debug('X32 channelMute event', { channel, muted });
      broadcastDeviceEvent('x32', 'channelMute', { channel, muted });
    });
    d.on('channelFader', (channel: unknown, level: unknown) => {
      logger.debug('X32 channelFader event', { channel, level });
      broadcastDeviceEvent('x32', 'channelFader', { channel, level });
    });
    d.on('auxInMute', (aux: unknown, muted: unknown) => {
      broadcastDeviceEvent('x32', 'auxInMute', { aux, muted });
    });
    d.on('auxInFader', (aux: unknown, level: unknown) => {
      broadcastDeviceEvent('x32', 'auxInFader', { aux, level });
    });
    d.on('fxRtnMute', (rtn: unknown, muted: unknown) => {
      broadcastDeviceEvent('x32', 'fxRtnMute', { rtn, muted });
    });
    d.on('fxRtnFader', (rtn: unknown, level: unknown) => {
      broadcastDeviceEvent('x32', 'fxRtnFader', { rtn, level });
    });
    d.on('dcaMute', (dca: unknown, muted: unknown) => {
      logger.debug('X32 dcaMute event', { dca, muted });
      broadcastDeviceEvent('x32', 'dcaMute', { dca, muted });
    });
    d.on('dcaFader', (dca: unknown, level: unknown) => {
      logger.debug('X32 dcaFader event', { dca, level });
      broadcastDeviceEvent('x32', 'dcaFader', { dca, level });
    });
    d.on('mainMute', (muted: unknown) => {
      broadcastDeviceEvent('x32', 'mainMute', { muted });
    });
    d.on('mainFader', (level: unknown) => {
      broadcastDeviceEvent('x32', 'mainFader', { level });
    });
    d.on('connected', () => {
      broadcastDeviceEvent('x32', 'connected', {});
      d.refreshState();
    });
    d.on('disconnected', () => {
      broadcastDeviceEvent('x32', 'disconnected', {});
    });
    d.on('error', (...args: unknown[]) => {
      const err = args[0];
      logger.error('X32 driver error', { error: err instanceof Error ? err.message : String(err) });
    });

    d.refreshState();
  }

  // ── ATEM ─────────────────────────────────────────────────────────────

  private async reconnectAtem(settings: AppSettings): Promise<void> {
    const cfg = settings.devices.atem;

    if (this.atem) {
      try { await this.atem.disconnect(); } catch { /* ignore */ }
      this.atem = null;
    }

    if (!cfg.enabled) {
      logger.info('ATEM disabled in settings');
      return;
    }

    if (!cfg.host) {
      logger.warn('ATEM host not set — skipping connect');
      return;
    }

    try {
      const driver = new AtemDriver({ host: cfg.host, port: cfg.port });
      this.atem = driver;
      await driver.connect();
      this.hookAtemEvents();
      logger.info('ATEM reconnected', { host: cfg.host, port: cfg.port });
    } catch (err) {
      logger.error('Failed to connect ATEM', {
        host: cfg.host,
        error: (err as Error).message,
      });
      this.atem = null;
    }
  }

  private hookAtemEvents(): void {
    const d = this.atem;
    if (!d) return;

    d.removeAllListeners();
    d.on('atemState', (state: unknown) => {
      broadcastDeviceEvent('atem', 'atemState', state);
    });
    d.on('programInput', (inputId: unknown) => {
      broadcastDeviceEvent('atem', 'programInput', { inputId });
    });
    d.on('previewInput', (inputId: unknown) => {
      broadcastDeviceEvent('atem', 'previewInput', { inputId });
    });
    d.on('cut', (me: unknown) => {
      broadcastDeviceEvent('atem', 'cut', { me });
    });
    d.on('autoTransition', (me: unknown) => {
      broadcastDeviceEvent('atem', 'autoTransition', { me });
    });
    d.on('connected', () => {
      broadcastDeviceEvent('atem', 'connected', {});
      d.refreshState();
    });
    d.on('disconnected', () => {
      broadcastDeviceEvent('atem', 'disconnected', {});
    });
    d.on('error', (...args: unknown[]) => {
      const err = args[0];
      logger.error('ATEM driver error', { error: err instanceof Error ? err.message : String(err) });
    });

    d.refreshState();

    const cached = d.getLastState();
    if (cached && cached.connected && cached.inputs.length > 0) {
      broadcastDeviceEvent('atem', 'atemState', cached);
    }
  }

  // ── Videohub ─────────────────────────────────────────────────────────

  private async reconnectVideohub(settings: AppSettings): Promise<void> {
    const cfg = settings.devices.videohub;

    if (this.videohub) {
      try { await this.videohub.disconnect(); } catch { /* ignore */ }
      this.videohub = null;
    }

    if (!cfg.enabled) {
      logger.info('Videohub disabled in settings');
      return;
    }

    if (!cfg.host) {
      logger.warn('Videohub host not set — skipping connect');
      return;
    }

    try {
      const driver = new VideohubDriver({ host: cfg.host, port: cfg.port });
      this.videohub = driver;
      await driver.connect();
      this.hookVideohubEvents();
      logger.info('Videohub reconnected', { host: cfg.host, port: cfg.port });
    } catch (err) {
      logger.error('Failed to connect Videohub', {
        host: cfg.host,
        error: (err as Error).message,
      });
      this.videohub = null;
    }
  }

  private hookVideohubEvents(): void {
    const d = this.videohub;
    if (!d) return;

    d.removeAllListeners();
    d.on('videohubState', (state: unknown) => {
      broadcastDeviceEvent('videohub', 'videohubState', state);
    });
    d.on('connected', () => {
      broadcastDeviceEvent('videohub', 'connected', {});
      d.refreshState();
    });
    d.on('disconnected', () => {
      broadcastDeviceEvent('videohub', 'disconnected', {});
    });
    d.on('error', (...args: unknown[]) => {
      const err = args[0];
      logger.error('Videohub driver error', { error: err instanceof Error ? err.message : String(err) });
    });

    d.refreshState();

    const cached = d.getLastState();
    if (cached && cached.connected && cached.outputs.length > 0) {
      broadcastDeviceEvent('videohub', 'videohubState', cached);
    }
  }

  // ── Broadlink ────────────────────────────────────────────────────────

  private async reconnectBroadlink(settings: AppSettings): Promise<void> {
    const cfg = settings.devices.broadlink;

    if (this.broadlink) {
      try { await this.broadlink.disconnect(); } catch { /* ignore */ }
      this.broadlink = null;
    }

    if (!cfg.enabled) {
      logger.info('Broadlink disabled in settings');
      return;
    }

    try {
      const svc = new BroadlinkService();
      this.broadlink = svc;

      if (cfg.host) {
        await svc.connect(cfg.host);
      } else {
        await svc.connect();
      }

      this.hookBroadlinkEvents();
      logger.info('Broadlink reconnected', { host: cfg.host || '(discovered)' });
    } catch (err) {
      logger.error('Failed to connect Broadlink', {
        host: cfg.host || '(auto)',
        error: (err as Error).message,
      });
      this.broadlink = null;
    }
  }

  private hookBroadlinkEvents(): void {
    const d = this.broadlink;
    if (!d) return;

    d.removeAllListeners();
    d.on('connected', () => {
      broadcastDeviceEvent('broadlink', 'connected', {});
    });
    d.on('disconnected', () => {
      broadcastDeviceEvent('broadlink', 'disconnected', {});
    });
  }
}
