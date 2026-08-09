import { EventEmitter } from 'node:events';
import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { discover, genDevice, Rm4mini, Rm4pro, Rmmini } from 'node-broadlink';
import type { RemoteInfo } from 'node:dgram';
import { logger } from '../../logger.js';
import type { BroadlinkState } from './types.js';

/**
 * Pick the first non-internal IPv4 address from the local machine.
 * The Broadlink discovery packet needs the actual interface IP, but
 * `socket.address().address` returns '0.0.0.0' for a wildcard-bound UDP
 * socket — so we resolve it independently before binding.
 */
function getLocalIpForTarget(_target: string): string | null {
  const ifaces = networkInterfaces();
  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return null;
}

/** Parse a Broadlink discovery response into device info. */
function parseDiscoveryResponse(
  msg: Buffer,
  rinfo: RemoteInfo,
): { deviceType: number; mac: number[]; name: string; isLocked: boolean } | null {
  if (msg.length < 0x3a) return null;

  const deviceType = msg[0x34] | (msg[0x35] << 8);
  const mac = [...msg.subarray(0x3a, 0x40)].reverse();
  const nameSlice = msg.slice(0x40, 0x7e);
  const nullIdx = nameSlice.indexOf(0x00);
  const name = nullIdx >= 0 ? nameSlice.slice(0, nullIdx).toString('utf8') : nameSlice.toString('utf8');
  const isLocked = msg[0x7f] === 1;

  return { deviceType, mac, name, isLocked };
}

/**
 * Manages a connection to a Broadlink RM device for sending IR/RF codes.
 *
 * Designed to be a singleton-ish service — the DeviceManager holds one
 * instance and reconnects when settings change.
 */
export class BroadlinkService extends EventEmitter {
  private device: Rm4mini | Rm4pro | Rmmini | null = null;
  private _connected = false;
  private _model = '';
  private _deviceType = 0;
  private _host = '';
  private _mac = '';

  get connected(): boolean {
    return this._connected;
  }

  /** Try to discover a Broadlink device, or connect to a specific IP. */
  async connect(host?: string): Promise<void> {
    if (this._connected) return;

    try {
      if (host) {
        await this.connectByHost(host);
      } else {
        await this.discoverDevice();
      }
    } catch (err) {
      this._connected = false;
      this.device = null;
      logger.error('Broadlink connection failed', {
        error: (err as Error).message,
      });
      throw err;
    }
  }

  /** Disconnect from the Broadlink device. */
  async disconnect(): Promise<void> {
    this.device = null;
    this._connected = false;
    this._host = '';
    this._mac = '';
    this._model = '';
    logger.info('Broadlink disconnected');
    this.emit('disconnected');
  }

  /** Send an IR hex code through the Broadlink device. */
  async sendIr(hexCode: string): Promise<void> {
    if (!this.device || !this._connected) {
      throw new Error('Broadlink not connected');
    }
    try {
      await this.device.sendData(hexCode);
      logger.debug('Broadlink IR sent', { len: hexCode.length });
    } catch (err) {
      logger.error('Failed to send IR code', {
        error: (err as Error).message,
      });
      throw err;
    }
  }

  /** Enter learning mode — returns the learned IR hex code when a button is pressed. */
  async startLearning(timeoutMs = 15_000): Promise<string> {
    if (!this.device || !this._connected) {
      throw new Error('Broadlink not connected');
    }

    await this.device.enterLearning();
    logger.info('Broadlink learning mode activated — press a button on the remote');

    // Poll for learned data
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const buf = await this.device.checkData();
        if (buf && buf.length > 0) {
          const hex = buf.toString('hex');
          logger.info('Broadlink IR code learned', { len: hex.length });
          await this.cancelLearning();
          return hex;
        }
      } catch {
        // checkData throws when no data yet — keep polling
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    await this.cancelLearning();
    throw new Error('Learning timed out — no IR code received');
  }

  /** Cancel an active learning session. */
  async cancelLearning(): Promise<void> {
    if (!this.device) return;
    try {
      await this.device.cancelLearning();
      logger.debug('Broadlink learning cancelled');
    } catch {
      // best effort
    }
  }

  /** Get current state info. */
  getState(): BroadlinkState {
    return {
      connected: this._connected,
      model: this._model,
      deviceType: this._deviceType,
      host: this._host,
      mac: this._mac,
    };
  }

  // ── Private ─────────────────────────────────────────────────────

  /** Discover via UDP broadcast (uses the library with a generous timeout). */
  private async discoverDevice(): Promise<void> {
    logger.info('Discovering Broadlink devices...');
    const devices = await discover(5_000); // 5 second timeout — default 500ms is too short
    if (devices.length === 0) {
      throw new Error('No Broadlink devices found on network');
    }

    const device = devices[0];
    await this.initDevice(device);
    logger.info('Broadlink device discovered', {
      model: this._model,
      host: this._host,
    });
  }

  /**
   * Connect to a known IP address.
   *
   * Strategy (tried in order):
   *  1. Library discover with 5s timeout, filter by IP
   *  2. Direct UDP probe to the specific IP (bypasses broadcast issues)
   */
  private async connectByHost(host: string): Promise<void> {
    logger.info('Connecting to Broadlink at', { host });

    // Strategy 1: standard discovery with generous timeout
    const devices = await discover(5_000);
    const found = devices.find((d) => d.host.address === host);
    if (found) {
      await this.initDevice(found);
      logger.info('Broadlink connected via discovery', { model: this._model, host: this._host });
      return;
    }

    // Strategy 2: direct UDP probe to the specific IP
    logger.info('Discovery did not find device — trying direct probe to', { host });
    const directDevice = await this.probeDevice(host);
    if (directDevice) {
      await this.initDevice(directDevice);
      logger.info('Broadlink connected via direct probe', { model: this._model, host: this._host });
      return;
    }

    throw new Error(`No Broadlink device found at ${host}`);
  }

/**
 * Send a discovery probe directly to the target IP, using the EXACT same
 * packet format as the library's discover() function.
 *
 * This bypasses the need for UDP broadcast — some networks block broadcast,
 * or the device may be in a state where it only responds to unicast probes.
 */
private async probeDevice(host: string, timeoutMs = 8_000): Promise<{
  host: RemoteInfo;
  mac: number[];
  deviceType: number;
  model: string;
  name: string;
  auth: () => Promise<unknown>;
} | null> {
  // Get the actual local interface IP that can reach this host
  const localIp = getLocalIpForTarget(host) || '0.0.0.0';

  return new Promise((resolve) => {
    const socket: Socket = createSocket('udp4');
    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, timeoutMs);

    socket.once('listening', () => {
      // Build the exact same packet as the library's discover()
      const now = new Date();
      const tz = now.getTimezoneOffset() / -3600;
      const packet = Buffer.alloc(0x30, 0);

      if (tz < 0) {
        packet[0x08] = 0xff + tz - 1;
        packet[0x09] = 0xff;
        packet[0x0a] = 0xff;
        packet[0x0b] = 0xff;
      } else {
        packet[0x08] = tz;
        packet[0x09] = 0;
        packet[0x0a] = 0;
        packet[0x0b] = 0;
      }

      packet[0x0c] = (now.getFullYear() - 1900) & 0xff;
      packet[0x0d] = ((now.getFullYear() - 1900) >> 8) & 0xff;
      packet[0x0e] = now.getMinutes();
      packet[0x0f] = now.getHours();
      packet[0x10] = ~~(now.getFullYear() % 100);
      packet[0x11] = now.getDay();
      packet[0x12] = now.getDay();
      packet[0x13] = now.getMonth();

      // Local IP address (use the actual interface IP, not '0.0.0.0')
      const localParts = localIp.split('.');
      if (localParts.length === 4) {
        packet[0x18] = ~~localParts[0];
        packet[0x19] = ~~localParts[1];
        packet[0x1a] = ~~localParts[2];
        packet[0x1b] = ~~localParts[3];
      }

      const addr = socket.address();
      packet[0x1c] = addr.port & 0xff;
      packet[0x1d] = (addr.port >> 8) & 0xff;
      packet[0x26] = 6;

      // Checksum
      const checksum = (packet.reduce((acc, b) => acc + b, 0xbeaf) & 0xffff);
      packet[0x20] = checksum & 0xff;
      packet[0x21] = (checksum >> 8) & 0xff;

      // Send directly to the target IP on port 80
      socket.send(packet, 0, packet.length, 80, host, (err) => {
        if (err) {
          logger.warn('Direct probe send failed', { host, error: err.message });
          clearTimeout(timer);
          socket.close();
          resolve(null);
        }
      });
    });

    socket.on('message', (msg: Buffer, rinfo: RemoteInfo) => {
      const parsed = parseDiscoveryResponse(msg, rinfo);
      if (!parsed) return;

      clearTimeout(timer);
      socket.close();

      const device = genDevice(
        parsed.deviceType,
        rinfo,
        parsed.mac,
        parsed.name,
        parsed.isLocked,
      );

      resolve({
        host: rinfo,
        mac: parsed.mac,
        deviceType: parsed.deviceType,
        model: device.model || `0x${parsed.deviceType.toString(16)}`,
        name: parsed.name,
        auth: () => device.auth(),
      });
    });

    socket.on('error', () => {
      clearTimeout(timer);
      socket.close();
      resolve(null);
    });

    socket.bind(0);
  });
}

  private async initDevice(device: {
    host: RemoteInfo;
    mac: number[];
    deviceType: number;
    model: string;
    name: string;
    auth: () => Promise<unknown>;
  }): Promise<void> {
    // Authenticate
    await device.auth();

    // Store device info
    this._host = device.host.address;
    this._mac = device.mac.map((b) => b.toString(16).padStart(2, '0')).join(':');
    this._model = device.model || `0x${device.deviceType.toString(16)}`;
    this._deviceType = device.deviceType;

    // Build a proper RM device for sendData / enterLearning
    const fullDevice = genDevice(device.deviceType, device.host, device.mac);
    await fullDevice.auth();
    this.device = fullDevice as unknown as Rm4mini;

    this._connected = true;
    this.emit('connected');
  }
}
