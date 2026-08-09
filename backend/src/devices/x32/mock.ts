import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import type { X32DriverHandle } from './driver-interface.js';

/**
 * Mock X32 driver for development without real hardware.
 * Simulates the X32 with fake meter data and response latencies.
 */
export class MockX32Driver extends EventEmitter implements X32DriverHandle {
  private _connected = false;
  private meterInterval: ReturnType<typeof setInterval> | null = null;
  private channelMutes: boolean[] = new Array(32).fill(false);
  private channelFaders: number[] = new Array(32).fill(0.75);
  private auxInMutes: boolean[] = new Array(6).fill(false);
  private auxInFaders: number[] = new Array(6).fill(0.75);
  private fxRtnMutes: boolean[] = new Array(4).fill(false);
  private fxRtnFaders: number[] = new Array(4).fill(0.75);
  private dcaMutes: boolean[] = new Array(8).fill(false);
  private dcaFaders: number[] = new Array(8).fill(0.75);
  private mainMute = false;
  private mainFader = 0.75;

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    this._connected = true;
    logger.info('Mock X32 connected (simulated)');
    this.emit('connected');
    this.startMeterPolling();
  }

  async disconnect(): Promise<void> {
    this.stopMeterPolling();
    this._connected = false;
    logger.info('Mock X32 disconnected');
    this.emit('disconnected');
  }

  setChannelMute(channel: number, mute: boolean): void {
    const idx = channel - 1;
    if (idx >= 0 && idx < 32) {
      this.channelMutes[idx] = mute;
      logger.debug(`Mock X32 channel ${channel} ${mute ? 'muted' : 'unmuted'}`);
      this.emit('channelMute', channel, mute);
    }
  }

  setChannelFader(channel: number, level01: number): void {
    const idx = channel - 1;
    if (idx >= 0 && idx < 32) {
      this.channelFaders[idx] = level01;
      logger.debug(`Mock X32 channel ${channel} fader = ${level01.toFixed(3)}`);
      this.emit('channelFader', channel, level01);
    }
  }

  setAuxInMute(aux: number, mute: boolean): void {
    const idx = aux - 1;
    if (idx >= 0 && idx < 6) {
      this.auxInMutes[idx] = mute;
      logger.debug(`Mock X32 auxin ${aux} ${mute ? 'muted' : 'unmuted'}`);
      this.emit('auxInMute', aux, mute);
    }
  }

  setAuxInFader(aux: number, level01: number): void {
    const idx = aux - 1;
    if (idx >= 0 && idx < 6) {
      this.auxInFaders[idx] = level01;
      logger.debug(`Mock X32 auxin ${aux} fader = ${level01.toFixed(3)}`);
      this.emit('auxInFader', aux, level01);
    }
  }

  setFxRtnMute(rtn: number, mute: boolean): void {
    const idx = rtn - 1;
    if (idx >= 0 && idx < 4) {
      this.fxRtnMutes[idx] = mute;
      logger.debug(`Mock X32 fxrtn ${rtn} ${mute ? 'muted' : 'unmuted'}`);
      this.emit('fxRtnMute', rtn, mute);
    }
  }

  setFxRtnFader(rtn: number, level01: number): void {
    const idx = rtn - 1;
    if (idx >= 0 && idx < 4) {
      this.fxRtnFaders[idx] = level01;
      logger.debug(`Mock X32 fxrtn ${rtn} fader = ${level01.toFixed(3)}`);
      this.emit('fxRtnFader', rtn, level01);
    }
  }

  setDcaMute(dca: number, mute: boolean): void {
    const idx = dca - 1;
    if (idx >= 0 && idx < 8) {
      this.dcaMutes[idx] = mute;
      logger.debug(`Mock X32 DCA ${dca} ${mute ? 'muted' : 'unmuted'}`);
      this.emit('dcaMute', dca, mute);
    }
  }

  setDcaFader(dca: number, level01: number): void {
    const idx = dca - 1;
    if (idx >= 0 && idx < 8) {
      this.dcaFaders[idx] = level01;
      logger.debug(`Mock X32 DCA ${dca} fader = ${level01.toFixed(3)}`);
      this.emit('dcaFader', dca, level01);
    }
  }

  setMainMute(mute: boolean): void {
    this.mainMute = mute;
    logger.debug(`Mock X32 main ${mute ? 'muted' : 'unmuted'}`);
    this.emit('mainMute', mute);
  }

  setMainFader(level01: number): void {
    this.mainFader = level01;
    logger.debug(`Mock X32 main fader = ${level01.toFixed(3)}`);
    this.emit('mainFader', level01);
  }

  recallScene(scene: number): void {
    logger.info(`Mock X32 recalled scene ${scene}`);
  }

  refreshState(): void {
    for (let ch = 1; ch <= 32; ch++) {
      this.emit('channelMute', ch, this.channelMutes[ch - 1]);
      this.emit('channelFader', ch, this.channelFaders[ch - 1]);
    }
    for (let aux = 1; aux <= 6; aux++) {
      this.emit('auxInMute', aux, this.auxInMutes[aux - 1]);
      this.emit('auxInFader', aux, this.auxInFaders[aux - 1]);
    }
    for (let rtn = 1; rtn <= 4; rtn++) {
      this.emit('fxRtnMute', rtn, this.fxRtnMutes[rtn - 1]);
      this.emit('fxRtnFader', rtn, this.fxRtnFaders[rtn - 1]);
    }
    for (let dca = 1; dca <= 8; dca++) {
      this.emit('dcaMute', dca, this.dcaMutes[dca - 1]);
      this.emit('dcaFader', dca, this.dcaFaders[dca - 1]);
    }
    this.emit('mainMute', this.mainMute);
    this.emit('mainFader', this.mainFader);
  }

  private startMeterPolling(): void {
    this.stopMeterPolling();
    this.meterInterval = setInterval(() => {
      // Simulate 32 channels of meter data in 4 groups
      for (let g = 0; g < 4; g++) {
        const values = Array.from({ length: 8 }, () =>
          Math.max(0, Math.min(1, 0.5 + (Math.random() - 0.5) * 0.3)),
        );
        this.emit('meter', { offset: g * 8, values });
      }
    }, 250);
  }

  private stopMeterPolling(): void {
    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }
  }
}
