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
  private dcaMutes: boolean[] = new Array(8).fill(false);
  private mainMute = false;

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

  setDcaMute(dca: number, mute: boolean): void {
    const idx = dca - 1;
    if (idx >= 0 && idx < 8) {
      this.dcaMutes[idx] = mute;
      logger.debug(`Mock X32 DCA ${dca} ${mute ? 'muted' : 'unmuted'}`);
      this.emit('dcaMute', dca, mute);
    }
  }

  setDcaFader(_dca: number, _level01: number): void {
    // Mock accepts but doesn't track DCA faders beyond mute
  }

  setMainMute(mute: boolean): void {
    this.mainMute = mute;
    logger.debug(`Mock X32 main ${mute ? 'muted' : 'unmuted'}`);
    this.emit('mainMute', mute);
  }

  setMainFader(_level01: number): void {
    // Mock accepts but doesn't track
  }

  recallScene(scene: number): void {
    logger.info(`Mock X32 recalled scene ${scene}`);
  }

  private startMeterPolling(): void {
    this.stopMeterPolling();
    this.meterInterval = setInterval(() => {
      // Simulate 8 channels of meter data with slight variance
      const values = Array.from({ length: 8 }, () =>
        Math.max(0, Math.min(1, 0.5 + (Math.random() - 0.5) * 0.3)),
      );
      this.emit('meter', { values });
    }, 250);
  }

  private stopMeterPolling(): void {
    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }
  }
}
