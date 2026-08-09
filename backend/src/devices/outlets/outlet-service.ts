import { EventEmitter } from 'node:events';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import * as path from 'node:path';
import * as tplink from 'tplink-smarthome-api';
import { loginDeviceByIp } from 'tp-link-tapo-connect';
import { logger } from '../../logger.js';

export type OutletType = 'tapo' | 'tasmota' | 'etekcity';

export interface OutletConfig {
  id: string;
  label: string;
  type: OutletType;
  host: string;
  enabled: boolean;
}

export interface OutletState {
  id: string;
  label: string;
  type: OutletType;
  host: string;
  poweredOn: boolean;
  reachable: boolean;
}

/**
 * Service for controlling smart outlets.
 *
 * - **Tasmota**: HTTP API — `http://<host>/cm?cmnd=Power%20On` etc.
 * - **Etekcity / Kasa**: TP-Link Smart Home Protocol — TCP port 9999, XOR encryption.
 *   Uses the `tplink-smarthome-api` library.
 * - **Tapo**: KLAP protocol over HTTP. Uses `tp-link-tapo-connect` library with
 *   TP-Link cloud credentials for device authentication.
 *
 * **Lazy auth**: `getState()` / `getStates()` return last-known cached states
 * without contacting devices. Only `powerOn()` / `powerOff()` / `toggle()` /
 * `refreshDevice()` trigger network calls.
 */
export class OutletService extends EventEmitter {
  private outletStates = new Map<string, boolean>();
  private readonly statesFilePath: string;

  // Kasa (legacy)
  private kasaClient: tplink.Client | null = null;
  private kasaDevices = new Map<string, tplink.Plug>();

  // Tapo (KLAP)
  private tapoEmail = '';
  private tapoPassword = '';
  private tapoCredentialsVersion = 0;
  private tapoDevices = new Map<string, { device: Awaited<ReturnType<typeof loginDeviceByIp>>; credsVersion: number }>();

  constructor(statesDir: string) {
    super();
    this.statesFilePath = path.join(statesDir, 'outlet-states.json');
  }

  /** Load last-known states from disk. Call once at server start. */
  async loadPersistedStates(): Promise<void> {
    try {
      const raw = await readFile(this.statesFilePath, 'utf-8');
      const parsed: Array<{ id: string; poweredOn: boolean }> = JSON.parse(raw);
      for (const entry of parsed) {
        this.outletStates.set(entry.id, entry.poweredOn);
      }
      logger.info(`Loaded ${parsed.length} persisted outlet states`);
    } catch {
      // File missing or corrupt — start with empty cache
    }
  }

  /** Persist current outlet states to disk. */
  private async persistStates(): Promise<void> {
    try {
      const entries = Array.from(this.outletStates.entries()).map(([id, poweredOn]) => ({ id, poweredOn }));
      await mkdir(path.dirname(this.statesFilePath), { recursive: true });
      const tmpPath = this.statesFilePath + '.tmp';
      await writeFile(tmpPath, JSON.stringify(entries, null, 2), 'utf-8');
      await rm(this.statesFilePath, { force: true });
      await rename(tmpPath, this.statesFilePath);
    } catch (err) {
      logger.error('Failed to persist outlet states', { error: (err as Error).message });
    }
  }

  /** Set Tapo cloud credentials. Call when settings change to invalidate cached device sessions. */
  setTapoCredentials(email: string, password: string): void {
    if (email !== this.tapoEmail || password !== this.tapoPassword) {
      this.tapoEmail = email;
      this.tapoPassword = password;
      this.tapoCredentialsVersion++;
      this.tapoDevices.clear();
      logger.info('Tapo credentials updated, device sessions invalidated');
    }
  }

  // ── Kasa ──────────────────────────────────────────────────────────

  private getKasaClient(): tplink.Client {
    if (!this.kasaClient) {
      this.kasaClient = new tplink.Client({ logLevel: 'warn' });
    }
    return this.kasaClient;
  }

  private async getKasaDevice(host: string): Promise<tplink.Plug> {
    const cached = this.kasaDevices.get(host);
    if (cached) return cached;

    const client = this.getKasaClient();
    const device = await client.getDevice({ host, port: 9999 }) as tplink.Plug;
    this.kasaDevices.set(host, device);
    return device;
  }

  // ── Tapo ──────────────────────────────────────────────────────────

  private async getTapoDevice(host: string): Promise<Awaited<ReturnType<typeof loginDeviceByIp>>> {
    const cached = this.tapoDevices.get(host);
    if (cached && cached.credsVersion === this.tapoCredentialsVersion) {
      return cached.device;
    }

    const device = await loginDeviceByIp(this.tapoEmail, this.tapoPassword, host);
    this.tapoDevices.set(host, { device, credsVersion: this.tapoCredentialsVersion });
    return device;
  }

  private async fetchTapoState(host: string): Promise<boolean> {
    const device = await this.getTapoDevice(host);
    const info = await device.getDeviceInfo();
    return info.device_on === true;
  }

  private async sendTapoCommand(id: string, host: string, turnOn: boolean): Promise<boolean> {
    const device = await this.getTapoDevice(host);
    if (turnOn) {
      await device.turnOn();
    } else {
      await device.turnOff();
    }
    this.outletStates.set(id, turnOn);
    await this.persistStates();
    return true;
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Fetch live power state from the device (triggers cloud auth for Tapo). */
  async refreshDevice(config: OutletConfig): Promise<OutletState> {
    if (!config.enabled || !config.host) {
      return { id: config.id, label: config.label, type: config.type, host: config.host, poweredOn: false, reachable: false };
    }

    try {
      let poweredOn = false;

      switch (config.type) {
        case 'tasmota':
          poweredOn = await this.getTasmotaState(config.host);
          break;
        case 'tapo':
          if (!this.tapoEmail || !this.tapoPassword) {
            throw new Error('Tapo credentials not configured');
          }
          poweredOn = await this.fetchTapoState(config.host);
          break;
        case 'etekcity':
          poweredOn = await this.getKasaState(config.id, config.host);
          break;
      }

      this.outletStates.set(config.id, poweredOn);
      await this.persistStates();

      return { id: config.id, label: config.label, type: config.type, host: config.host, poweredOn, reachable: true };
    } catch (err) {
      logger.warn('Outlet refresh failed', { id: config.id, error: (err as Error).message });
      return { id: config.id, label: config.label, type: config.type, host: config.host, poweredOn: false, reachable: false };
    }
  }

  /** Fetch last-known power state — no network calls (no cloud auth). */
  async getState(config: OutletConfig): Promise<OutletState> {
    if (!config.enabled || !config.host) {
      return { id: config.id, label: config.label, type: config.type, host: config.host, poweredOn: false, reachable: false };
    }

    const poweredOn = this.outletStates.get(config.id) ?? false;
    return { id: config.id, label: config.label, type: config.type, host: config.host, poweredOn, reachable: true };
  }

  /** Fetch last-known states for all outlets — no network calls. */
  async getStates(configs: OutletConfig[]): Promise<OutletState[]> {
    return configs.map((c) => ({
      id: c.id,
      label: c.label,
      type: c.type,
      host: c.host,
      poweredOn: this.outletStates.get(c.id) ?? false,
      reachable: true,
    }));
  }

  /** Power on an outlet. */
  async powerOn(config: OutletConfig): Promise<boolean> {
    return this.sendCommand(config, true);
  }

  /** Power off an outlet. */
  async powerOff(config: OutletConfig): Promise<boolean> {
    return this.sendCommand(config, false);
  }

  /** Toggle power state. */
  async toggle(config: OutletConfig): Promise<boolean> {
    const current = this.outletStates.get(config.id);
    return this.sendCommand(config, !current);
  }

  // ── Private ──────────────────────────────────────────────────────────

  private async sendCommand(config: OutletConfig, turnOn: boolean): Promise<boolean> {
    if (!config.enabled || !config.host) {
      logger.warn('Outlet not configured', { id: config.id });
      return false;
    }

    try {
      switch (config.type) {
        case 'tasmota':
          return await this.sendTasmotaCommand(config.id, config.host, turnOn);
        case 'tapo':
          if (!this.tapoEmail || !this.tapoPassword) {
            throw new Error('Tapo credentials not configured');
          }
          return await this.sendTapoCommand(config.id, config.host, turnOn);
        case 'etekcity':
          return await this.sendKasaCommand(config.id, config.host, turnOn);
        default:
          return false;
      }
    } catch (err) {
      logger.error('Outlet command failed', {
        id: config.id,
        turnOn,
        error: (err as Error).message,
      });
      return false;
    }
  }

  // ── Tasmota ──────────────────────────────────────────────────────────

  private async getTasmotaState(host: string): Promise<boolean> {
    const res = await fetch(`http://${host}/cm?cmnd=Power`, { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    const data = JSON.parse(text);
    return data.POWER === 'ON';
  }

  private async sendTasmotaCommand(id: string, host: string, turnOn: boolean): Promise<boolean> {
    const cmd = turnOn ? 'Power%20On' : 'Power%20Off';
    const res = await fetch(`http://${host}/cm?cmnd=${cmd}`, { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    const data = JSON.parse(text);
    const success = data.POWER === (turnOn ? 'ON' : 'OFF');
    if (success) {
      this.outletStates.set(id, turnOn);
    }
    return success;
  }

  // ── Kasa / Etekcity (via tplink-smarthome-api) ──────────────────────

  private async getKasaState(id: string, host: string): Promise<boolean> {
    const device = await this.getKasaDevice(host);
    const state = await device.getPowerState();
    return state;
  }

  private async sendKasaCommand(id: string, host: string, turnOn: boolean): Promise<boolean> {
    const device = await this.getKasaDevice(host);
    await device.setPowerState(turnOn);
    this.outletStates.set(id, turnOn);
    return true;
  }
}
