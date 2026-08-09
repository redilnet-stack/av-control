import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import type { BroadlinkState } from './types.js';

/**
 * Mock Broadlink service for development without real hardware.
 * Simulates sending IR codes and learning.
 */
export class MockBroadlinkService extends EventEmitter {
  private _connected = false;
  private _learning = false;

  get connected(): boolean {
    return this._connected;
  }

  async connect(_host?: string): Promise<void> {
    this._connected = true;
    logger.info('Mock Broadlink connected (simulated)');
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this._learning = false;
    logger.info('Mock Broadlink disconnected');
    this.emit('disconnected');
  }

  async sendIr(hexCode: string): Promise<void> {
    if (!this._connected) throw new Error('Broadlink not connected');
    logger.debug('Mock Broadlink IR sent', { len: hexCode.length });
    // Simulate a short delay
    await new Promise((r) => setTimeout(r, 100));
  }

  async startLearning(timeoutMs = 15_000): Promise<string> {
    if (!this._connected) throw new Error('Broadlink not connected');
    this._learning = true;
    logger.info('Mock Broadlink learning mode — press a button...');

    // Simulate waiting for a code, then return a fake hex code
    await new Promise((r) => setTimeout(r, 2000));
    this._learning = false;

    // Return a plausible-looking dummy IR hex code
    const fakeCode = '2600d8000001289413381438131213121312133814381438131213121312131213121312133814381438131213121312131213121312131213121312131213121312131213121312131213121312131213121312131213121312000d05';
    logger.info('Mock Broadlink IR code learned');
    return fakeCode;
  }

  async cancelLearning(): Promise<void> {
    this._learning = false;
    logger.debug('Mock Broadlink learning cancelled');
  }

  getState(): BroadlinkState {
    return {
      connected: this._connected,
      model: 'Mock RM4 Mini',
      deviceType: 0x520d,
      host: this._connected ? '192.168.1.100' : '',
      mac: 'aa:bb:cc:dd:ee:ff',
    };
  }
}
