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
  private statePollInterval: ReturnType<typeof setInterval> | null = null;
  private xremoteInterval: ReturnType<typeof setInterval> | null = null;

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
        // Enable /xremote — X32 pushes parameter changes in real-time
        // Sending empty args (bare address) is required — typed args are not recognized
        logger.info('X32 sending /xremote enable for real-time parameter push');
        this.sendOsc('/xremote', []);
        this.startMeterPolling();
        // Heartbeat every 3s to keep xremote alive
        // MUST be after startMeterPolling() — it calls stopMeterPolling() which clears all intervals
        this.xremoteInterval = setInterval(() => {
            this.sendOsc('/xremote', []);
        }, 3000);
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
    logger.info(`X32 setChannelMute ch=${channel} mute=${mute}`);
    // X32 /mix/on: 1=ON(unmuted), 0=OFF(muted)
    this.sendOsc(OSC_PATTERNS.channelOn(channel), [
      { type: 'f', value: mute ? 0.0 : 1.0 },
    ]);
    this.emit('channelMute', channel, mute);
  }

  setAuxInMute(aux: number, mute: boolean): void {
    this.sendOsc(OSC_PATTERNS.auxInOn(aux), [
      { type: 'f', value: mute ? 0.0 : 1.0 },
    ]);
    this.emit('auxInMute', aux, mute);
  }

  setAuxInFader(aux: number, level01: number): void {
    const clamped = Math.max(0, Math.min(1, level01));
    this.sendOsc(OSC_PATTERNS.auxInFader(aux), [
      { type: 'f', value: clamped },
    ]);
    this.emit('auxInFader', aux, clamped);
  }

  setFxRtnMute(rtn: number, mute: boolean): void {
    this.sendOsc(OSC_PATTERNS.fxRtnOn(rtn), [
      { type: 'f', value: mute ? 0.0 : 1.0 },
    ]);
    this.emit('fxRtnMute', rtn, mute);
  }

  setFxRtnFader(rtn: number, level01: number): void {
    const clamped = Math.max(0, Math.min(1, level01));
    this.sendOsc(OSC_PATTERNS.fxRtnFader(rtn), [
      { type: 'f', value: clamped },
    ]);
    this.emit('fxRtnFader', rtn, clamped);
  }

  /** Set channel fader to a value 0.0 – 1.0 (maps to -∞ to +10 dB). */
  setChannelFader(channel: number, level01: number): void {
    const clamped = Math.max(0, Math.min(1, level01));
    this.sendOsc(OSC_PATTERNS.channelFader(channel), [
      { type: 'f', value: clamped },
    ]);
    this.emit('channelFader', channel, clamped);
  }

  /** Mute (1) or unmute (0) a DCA. */
  setDcaMute(dca: number, mute: boolean): void {
    // X32 /dca/N/on: 1=ON(unmuted), 0=OFF(muted)
    this.sendOsc(OSC_PATTERNS.dcaOn(dca), [
      { type: 'f', value: mute ? 0.0 : 1.0 },
    ]);
    this.emit('dcaMute', dca, mute);
  }

  /** Set DCA fader 0.0 – 1.0. */
  setDcaFader(dca: number, level01: number): void {
    const clamped = Math.max(0, Math.min(1, level01));
    this.sendOsc(OSC_PATTERNS.dcaFader(dca), [
      { type: 'f', value: clamped },
    ]);
    this.emit('dcaFader', dca, clamped);
  }

  /** Mute (1) or unmute (0) main stereo out. */
  setMainMute(mute: boolean): void {
    // X32 /main/st/mix/on: 1=ON(unmuted), 0=OFF(muted)
    this.sendOsc(OSC_PATTERNS.mainOn, [
      { type: 'f', value: mute ? 0.0 : 1.0 },
    ]);
    this.emit('mainMute', mute);
  }

  /** Set main fader 0.0 – 1.0. */
  setMainFader(level01: number): void {
    const clamped = Math.max(0, Math.min(1, level01));
    this.sendOsc(OSC_PATTERNS.mainFader, [
      { type: 'f', value: clamped },
    ]);
    this.emit('mainFader', clamped);
  }

  /** Recall a scene by number (1-100). */
  recallScene(scene: number): void {
    this.sendOsc('/scene', [{ type: 'i', value: Math.max(1, Math.min(100, scene)) }]);
  }

  /** Query the X32 for current mute states and re-emit them. */
  refreshState(): void {
    this.queryInitialState();
  }

  // ── Meter Polling ───────────────────────────────────────────────────

  private startMeterPolling(): void {
    this.stopMeterPolling();
    // Poll all 4 meter groups (ch 1-32) every 250ms
    this.requestAllMeters();
    this.meterInterval = setInterval(() => this.requestAllMeters(), 250);
    // Poll DCA + main state every 5s to recover from UDP loss
    this.statePollInterval = setInterval(() => this.queryDcaMainState(), 5000);
  }

  private stopMeterPolling(): void {
    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }
    if (this.statePollInterval) {
      clearInterval(this.statePollInterval);
      this.statePollInterval = null;
    }
    if (this.xremoteInterval) {
      clearInterval(this.xremoteInterval);
      this.xremoteInterval = null;
    }
  }

  private requestAllMeters(): void {
    for (let g = 1; g <= 4; g++) {
      this.sendOsc(OSC_PATTERNS.meters(g), []);
    }
  }

  /** Re-query DCA + main state periodically to handle UDP packet loss. */
  private queryDcaMainState(): void {
    for (let dca = 1; dca <= 8; dca++) {
      this.sendOsc(OSC_PATTERNS.dcaOn(dca), []);
      this.sendOsc(OSC_PATTERNS.dcaFader(dca), []);
    }
    this.sendOsc(OSC_PATTERNS.mainOn, []);
    this.sendOsc(OSC_PATTERNS.mainFader, []);
  }

  /** Query X32 for current mute + fader state of channels, DCAs, and main.
   *  The X32 responds with the current value — handleMessage() emits
   *  events that flow through to the frontend via WebSocket. */
  private queryInitialState(): void {
    for (let ch = 1; ch <= 32; ch++) {
      this.sendOsc(OSC_PATTERNS.channelOn(ch), []);
      this.sendOsc(OSC_PATTERNS.channelFader(ch), []);
    }
    for (let aux = 1; aux <= 6; aux++) {
      this.sendOsc(OSC_PATTERNS.auxInOn(aux), []);
      this.sendOsc(OSC_PATTERNS.auxInFader(aux), []);
    }
    for (let rtn = 1; rtn <= 4; rtn++) {
      this.sendOsc(OSC_PATTERNS.fxRtnOn(rtn), []);
      this.sendOsc(OSC_PATTERNS.fxRtnFader(rtn), []);
    }
    for (let dca = 1; dca <= 8; dca++) {
      this.sendOsc(OSC_PATTERNS.dcaOn(dca), []);
      this.sendOsc(OSC_PATTERNS.dcaFader(dca), []);
    }
    this.sendOsc(OSC_PATTERNS.mainOn, []);
    this.sendOsc(OSC_PATTERNS.mainFader, []);
  }

  // ── Internal Helpers ────────────────────────────────────────────────

  private sendOsc(address: string, args: osc.Argument[]): void {
    if (!this.udpPort || !this._connected) {
      logger.warn('X32 not connected, cannot send', { address });
      return;
    }
    try {
      logger.debug(`X32 send OSC: ${address}`, { args });
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
      // Log all non-meter incoming OSC at info level for debugging
      if (!address.startsWith('/meters/')) {
        logger.info(`X32 recv OSC: ${address}`, { args: args.length > 0 ? args.map(a => (a as { value?: unknown })?.value ?? a) : '(empty)' });
      }
      if (address.startsWith('/meters/')) {
        const groupMatch = address.match(/\/meters\/(\d+)/);
        const group = groupMatch ? parseInt(groupMatch[1], 10) : 1;
        const offset = (group - 1) * 8;
        const values = args.map((a: osc.Argument) => {
          if (typeof a === 'object' && a !== null && 'value' in a) {
            return (a as { value: number }).value;
          }
          return 0;
        });
        this.emit('meter', { offset, values });
      } else if (address.match(/\/ch\/\d+\/mix\/on/)) {
        const channelMatch = address.match(/\/ch\/(\d+)\/mix\/on/);
        if (channelMatch && args[0]) {
          const ch = parseInt(channelMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          // X32: 0=OFF(muted), 1=ON(unmuted)
          this.emit('channelMute', ch, val === 0);
        }
      } else if (address.match(/\/auxin\/\d+\/mix\/on/)) {
        const auxMatch = address.match(/\/auxin\/(\d+)\/mix\/on/);
        if (auxMatch && args[0]) {
          const aux = parseInt(auxMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          this.emit('auxInMute', aux, val === 0);
        }
      } else if (address.match(/\/fxrtn\/\d+\/mix\/on/)) {
        const rtnMatch = address.match(/\/fxrtn\/(\d+)\/mix\/on/);
        if (rtnMatch && args[0]) {
          const rtn = parseInt(rtnMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          this.emit('fxRtnMute', rtn, val === 0);
        }
      } else if (address.match(/\/dca\/\d+\/on/)) {
        const dcaMatch = address.match(/\/dca\/(\d+)\/on/);
        if (dcaMatch && args[0]) {
          const dca = parseInt(dcaMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          this.emit('dcaMute', dca, val === 0);
        }
      } else if (address === OSC_PATTERNS.mainOn) {
        if (args[0]) {
          const val = (args[0] as { value: number }).value;
          this.emit('mainMute', val === 0);
        }
      } else if (address.match(/\/ch\/\d+\/mix\/fader/)) {
        const channelMatch = address.match(/\/ch\/(\d+)\/mix\/fader/);
        if (channelMatch && args[0]) {
          const ch = parseInt(channelMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          this.emit('channelFader', ch, val);
        }
      } else if (address.match(/\/auxin\/\d+\/mix\/fader/)) {
        const auxMatch = address.match(/\/auxin\/(\d+)\/mix\/fader/);
        if (auxMatch && args[0]) {
          const aux = parseInt(auxMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          this.emit('auxInFader', aux, val);
        }
      } else if (address.match(/\/fxrtn\/\d+\/mix\/fader/)) {
        const rtnMatch = address.match(/\/fxrtn\/(\d+)\/mix\/fader/);
        if (rtnMatch && args[0]) {
          const rtn = parseInt(rtnMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          this.emit('fxRtnFader', rtn, val);
        }
      } else if (address.match(/\/dca\/\d+\/fader/)) {
        const dcaMatch = address.match(/\/dca\/(\d+)\/fader/);
        if (dcaMatch && args[0]) {
          const dca = parseInt(dcaMatch[1], 10);
          const val = (args[0] as { value: number }).value;
          this.emit('dcaFader', dca, val);
        }
      } else if (address === OSC_PATTERNS.mainFader) {
        if (args[0]) {
          const val = (args[0] as { value: number }).value;
          this.emit('mainFader', val);
        }
      } else if (args.length > 0) {
        // Log unhandled messages so we can discover unknown OSC addresses
        logger.debug('X32 unhandled OSC message', { address, args: args.map(a => (a as { value?: unknown })?.value ?? a) });
      }
    } catch (err) {
      logger.error('Error handling OSC message', {
        address,
        error: (err as Error).message,
      });
    }
  }
}
