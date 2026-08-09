import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import type { AtemDriverHandle } from './driver-interface.js';
import type { AtemInputInfo, AtemSwitcherState } from './types.js';

/**
 * Mock ATEM driver for development without real hardware.
 * Simulates the ATEM with fake inputs and transition behavior.
 */
export class MockAtemDriver extends EventEmitter implements AtemDriverHandle {
  private _connected = false;
  private _programInput = 1;
  private _previewInput = 2;
  private _transitionPosition = 0;
  private _inTransition = false;
  private _meCount = 1;
  private lastEmittedState: AtemSwitcherState | null = null;

  private readonly inputs: AtemInputInfo[] = [
    { inputId: 0, longName: 'Black', shortName: 'Blk', isProgram: false, isPreview: false },
    { inputId: 1, longName: 'Camera 1', shortName: 'Cam1', isProgram: true, isPreview: false },
    { inputId: 2, longName: 'Camera 2', shortName: 'Cam2', isProgram: false, isPreview: true },
    { inputId: 3, longName: 'HDMI 1', shortName: 'HDMI1', isProgram: false, isPreview: false },
    { inputId: 4, longName: 'HDMI 2', shortName: 'HDMI2', isProgram: false, isPreview: false },
    { inputId: 5, longName: 'Computer', shortName: 'PC', isProgram: false, isPreview: false },
    { inputId: 10, longName: 'Media Player 1', shortName: 'MP1', isProgram: false, isPreview: false },
  ];

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    this._connected = true;
    logger.info('Mock ATEM connected (simulated)');
    this.emit('connected');
    this.emitState();
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    logger.info('Mock ATEM disconnected');
    this.emit('disconnected');
  }

  async changeProgramInput(inputId: number, _me = 0): Promise<void> {
    if (!this._connected) return;
    if (this.inputs.some((i) => i.inputId === inputId)) {
      this._programInput = inputId;
      this.updateInputFlags();
      logger.debug(`Mock ATEM program input → ${inputId}`);
      this.emitState();
    }
  }

  async changePreviewInput(inputId: number, _me = 0): Promise<void> {
    if (!this._connected) return;
    if (this.inputs.some((i) => i.inputId === inputId)) {
      this._previewInput = inputId;
      this.updateInputFlags();
      logger.debug(`Mock ATEM preview input → ${inputId}`);
      this.emitState();
    }
  }

  async cut(_me = 0): Promise<void> {
    if (!this._connected) return;
    const oldProgram = this._programInput;
    this._programInput = this._previewInput;
    this._previewInput = oldProgram;
    this.updateInputFlags();
    logger.debug('Mock ATEM cut performed');
    this.emit('cut', _me);
    this.emitState();
  }

  async autoTransition(_me = 0): Promise<void> {
    if (!this._connected) return;
    this._inTransition = true;
    this.emitState();
    logger.debug('Mock ATEM auto transition started');
    this._transitionPosition = 0;
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, 100));
      this._transitionPosition = i / steps;
      this.emitState();
    }
    const oldProgram = this._programInput;
    this._programInput = this._previewInput;
    this._previewInput = oldProgram;
    this._transitionPosition = 0;
    this._inTransition = false;
    this.updateInputFlags();
    logger.debug('Mock ATEM auto transition completed');
    this.emit('autoTransition', _me);
    this.emitState();
  }

  async setTransitionPosition(position: number, _me = 0): Promise<void> {
    if (!this._connected) return;
    this._transitionPosition = Math.max(0, Math.min(1, position));
    logger.debug(`Mock ATEM transition position → ${this._transitionPosition}`);
    if (this._transitionPosition >= 1) {
      const oldProgram = this._programInput;
      this._programInput = this._previewInput;
      this._previewInput = oldProgram;
      this._transitionPosition = 0;
      this._inTransition = false;
      this.updateInputFlags();
      logger.debug('Mock ATEM transition completed via T-bar');
    } else {
      this._inTransition = true;
    }
    this.emitState();
  }

  refreshState(): void {
    this.emitState();
  }

  getLastState(): AtemSwitcherState | null {
    return this.lastEmittedState;
  }

  private updateInputFlags(): void {
    for (const input of this.inputs) {
      input.isProgram = input.inputId === this._programInput;
      input.isPreview = input.inputId === this._previewInput;
    }
  }

  private emitState(): void {
    const state: AtemSwitcherState = {
      connected: this._connected,
      programInput: this._programInput,
      previewInput: this._previewInput,
      transitionPosition: this._transitionPosition,
      transitionInTransition: this._inTransition,
      meCount: this._meCount,
      inputs: this.inputs.map((i) => ({ ...i })),
    };
    this.lastEmittedState = state;
    this.emit('atemState', state);
    this.emit('programInput', this._programInput);
    this.emit('previewInput', this._previewInput);
  }
}
