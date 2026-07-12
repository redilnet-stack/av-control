import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import type { AppSettings } from '../../config/settings-schema.js';
import type { X32DriverHandle } from '../x32/driver-interface.js';
import { createX32Driver } from '../x32/index.js';
import { broadcastDeviceEvent } from '../../api/websocket.js';

/**
 * Manages the lifecycle of all device drivers.
 * Handles connect / disconnect / reconnect when settings change.
 */
export class DeviceManager extends EventEmitter {
  private x32: X32DriverHandle | null = null;
  private currentSettings: AppSettings | null = null;

  /** Initialise (or re-initialise) all devices from settings. */
  async applySettings(settings: AppSettings): Promise<void> {
    const prev = this.currentSettings;
    this.currentSettings = settings;

    const tasks: Promise<void>[] = [];

    if (settings.mockDevices) {
      logger.info('Mock mode enabled — connecting simulated devices');
      await this.disconnectAll();
      this.x32 = createX32Driver();
      await this.x32.connect();
      this.hookX32Events();
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

    // Future: ATEM, Videohub, Broadlink, Outlets ...

    await Promise.allSettled(tasks);
  }

  /** Access the X32 driver handle (or null if not connected). */
  getX32(): X32DriverHandle | null {
    return this.x32;
  }

  /** Get status of all managed devices. */
  getStatus() {
    return {
      x32: {
        connected: this.x32?.connected ?? false,
        enabled: this.currentSettings?.devices.x32.enabled ?? false,
        mock: this.currentSettings?.mockDevices ?? false,
      },
    };
  }

  /** Disconnect all devices. */
  async disconnectAll(): Promise<void> {
    if (this.x32) {
      try {
        await this.x32.disconnect();
      } catch { /* ignore */ }
      this.x32 = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────────

  private async reconnectX32(settings: AppSettings): Promise<void> {
    const cfg = settings.devices.x32;

    // Disconnect old
    if (this.x32) {
      try {
        await this.x32.disconnect();
      } catch { /* ignore */ }
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
      const driver = createX32Driver();
      this.x32 = driver;
      await driver.connect();
      this.hookX32Events();
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
      broadcastDeviceEvent('x32', 'channelMute', { channel, muted });
    });
    d.on('channelFader', (channel: unknown, level: unknown) => {
      broadcastDeviceEvent('x32', 'channelFader', { channel, level });
    });
    d.on('connected', () => {
      broadcastDeviceEvent('x32', 'connected', {});
    });
    d.on('disconnected', () => {
      broadcastDeviceEvent('x32', 'disconnected', {});
    });
    d.on('error', (...args: unknown[]) => {
      const err = args[0];
      logger.error('X32 driver error', { error: err instanceof Error ? err.message : String(err) });
    });
  }
}
