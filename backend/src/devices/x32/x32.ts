import osc from 'osc';
import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import type { X32Config, X32MeterData } from './types.js';
import { OSC_PATTERNS } from './types.js';
import type { X32DriverHandle } from './driver-interface.js';

export class X32Driver extends EventEmitter implements X32DriverHandle {
  private udpPort: osc.UDPPort | null = null;
  private config: X32Config;
  private _connected = false;
  private meterInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: X32Config) {
    super();
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  // ── Connection ──────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this._connected) return;

    if (!this.config.host) {
      throw new Error('X32 host not configured (set X32_HOST env var)');
    }

    return new Promise((resolve, reject) => {
      this.udpPort = new osc.UDPPort({
        localAddress: '0.0.0.0',
        localPort: 0, // OS picks a random port
        remoteAddress: this.config.host!,
        remotePort: this.config.port,
        metadata: true,
      });

      this.udpPort.on('ready', () => {
        this._connected = true;
        logger.info(`X32 connected to ${this.config.host}:${this.config.port}`);
        this.emit('connected');
        this.startMeterPolling();
        resolve();
      });

      this.udpPort.on('message', (oscMsg, _timeTag, _info) => {
        this.handleMessage(oscMsg);
      });

      this.udpPort.on('error', (err: Error) => {
        logger.error('X32 UDP error', { error: err.message });
        this.emit('error', err);
      });

      this.udpPort.on('close', () => {
        this._connected = false;
        logger.warn('X32 connection closed');
        this.emit('disconnected');
      });

      this.udpPort.open();
    });
  }

  async disconnect(): Promise<void> {
    this.stopMeterPolling();
    this._connected = false;
    this.udpPort?.close();
    this.udpPort = null;
    logger.info('X32 disconnected');
  }

  // ── Sending OSC Commands ────────────────────────────────────────────

  /** Mute (1) or unmute (0) a channel. */
  setChannelMute(channel: number, mute: boolean): void {
    this.sendOsc(OSC_PATTERNS.channelOn(channel), [
      { type: 'i', value: mute ? 1 : 0 },
    ]);
  }

  /** Set channel fader to a value 0.0 – 1.0 (maps to -∞ to +10 dB). */
  setChannelFader(channel: number, level01: number): void {
    const clamped = Math.max(0, Math.min(1, level01));
    this.sendOsc(OSC_PATTERNS.channelFader(channel), [
      { type: 'f', value: clamped },
    ]);
  }

  /** Mute (1) or unmute (0) a DCA. */
  setDcaMute(dca: number, mute: boolean): void {
    this.sendOsc(OSC_PATTERNS.dcaOn(dca), [
      { type: 'i', value: mute ? 1 : 0 },
    ]);
  }

  /** Set DCA fader 0.0 – 1.0. */
  setDcaFader(dca: number, level01: number): void {
    const clamped = Math.max(0, Math.min(1, level01));
    this.sendOsc(OSC_PATTERNS.dcaFader(dca), [
      { type: 'f', value: clamped },
    ]);
  }

  /** Mute (1) or unmute (0) main stereo out. */
  setMainMute(mute: boolean): void {
    this.sendOsc(OSC_PATTERNS.mainOn, [
      { type: 'i', value: mute ? 1 : 0 },
    ]);
  }

  /** Set main fader 0.0 – 1.0. */
  setMainFader(level01: number): void {
    const clamped = Math.max(0, Math.min(1, level01));
    this.sendOsc(OSC_PATTERNS.mainFader, [
      { type: 'f', value: clamped },
    ]);
  }

  /** Recall a scene by number (1-100). */
  recallScene(scene: number): void {
    this.sendOsc('/scene', [{ type: 'i', value: Math.max(1, Math.min(100, scene)) }]);
  }

  // ── Meter Polling ───────────────────────────────────────────────────

  private startMeterPolling(): void {
    this.stopMeterPolling();
    // Poll meters every 250ms (group 1 = channels 1-8)
    this.requestMeters();
    this.meterInterval = setInterval(() => this.requestMeters(), 250);
  }

  private stopMeterPolling(): void {
    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }
  }

  private requestMeters(): void {
    this.sendOsc(OSC_PATTERNS.meters(1), []);
  }

  // ── Internal Helpers ────────────────────────────────────────────────

  private sendOsc(address: string, args: osc.Argument[]): void {
    if (!this.udpPort || !this._connected) {
      logger.warn('X32 not connected, cannot send', { address });
      return;
    }
    try {
      this.udpPort.send({ address, args }, undefined, undefined);
    } catch (err) {
      logger.error('Failed to send OSC message', {
        address,
        error: (err as Error).message,
      });
    }
  }

  private handleMessage(oscMsg: osc.OscMessage): void {
    const address = oscMsg.address;
    const args = oscMsg.args;

    try {
      if (address.startsWith('/meters/')) {
        const values = args.map((a: osc.Argument) => {
          if (typeof a === 'object' && a !== null && 'value' in a) {
            return (a as { value: number }).value;
          }
          return 0;
        });
        this.emit('meter', { values });
      } else if (address.endsWith('/mix/on')) {
        const channelMatch = address.match(/\/ch\/(\d+)\/mix\/on/);
        if (channelMatch && args[0]) {
          const ch = parseInt(channelMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          this.emit('channelMute', ch, val === 1);
        }
      } else if (address.endsWith('/mix/fader')) {
        const channelMatch = address.match(/\/ch\/(\d+)\/mix\/fader/);
        if (channelMatch && args[0]) {
          const ch = parseInt(channelMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          this.emit('channelFader', ch, val);
        }
      }
      // Additional OSC message types can be handled here
    } catch (err) {
      logger.error('Error handling OSC message', {
        address,
        error: (err as Error).message,
      });
    }
  }
}
