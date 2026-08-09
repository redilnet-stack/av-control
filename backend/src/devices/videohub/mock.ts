import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import type { VideohubDriverHandle } from './driver-interface.js';
import type { VideohubInputInfo, VideohubOutputInfo, VideohubState, PortLock } from './types.js';

/**
 * Mock Videohub driver for development without real hardware.
 * Simulates a Smart Videohub 20×20 with labeled inputs/outputs.
 */
export class MockVideohubDriver extends EventEmitter implements VideohubDriverHandle {
  private _connected = false;
  private lastEmittedState: VideohubState | null = null;

  private readonly INPUT_COUNT = 20;
  private readonly OUTPUT_COUNT = 20;

  private inputs: VideohubInputInfo[] = [];
  private outputs: VideohubOutputInfo[] = [];
  private locks: PortLock[] = [];

  constructor() {
    super();
    this.resetState();
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    this._connected = true;
    this.resetState();
    logger.info('Mock Videohub connected (simulated 20×20)');
    this.emit('connected');
    this.emitState();
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    logger.info('Mock Videohub disconnected');
    this.emit('disconnected');
  }

  async setRoute(output: number, input: number): Promise<void> {
    if (!this._connected) return;
    if (output >= 0 && output < this.OUTPUT_COUNT && input >= 0 && input < this.INPUT_COUNT) {
      this.outputs[output].routedInput = input;
      logger.debug(`Mock Videohub route: output ${output} → input ${input}`);
      this.emitState();
    }
  }

  async setInputLabel(inputId: number, label: string): Promise<void> {
    if (!this._connected) return;
    if (inputId >= 0 && inputId < this.INPUT_COUNT) {
      this.inputs[inputId].label = label;
      logger.debug(`Mock Videohub input ${inputId} label → "${label}"`);
      this.emitState();
    }
  }

  async setOutputLabel(outputId: number, label: string): Promise<void> {
    if (!this._connected) return;
    if (outputId >= 0 && outputId < this.OUTPUT_COUNT) {
      this.outputs[outputId].label = label;
      logger.debug(`Mock Videohub output ${outputId} label → "${label}"`);
      this.emitState();
    }
  }

  refreshState(): void {
    this.emitState();
  }

  getLastState(): VideohubState | null {
    return this.lastEmittedState;
  }

  private resetState(): void {
    this.inputs = Array.from({ length: this.INPUT_COUNT }, (_, i) => ({
      inputId: i,
      label: this.getDefaultInputLabel(i),
    }));

    this.outputs = Array.from({ length: this.OUTPUT_COUNT }, (_, i) => ({
      outputId: i,
      label: this.getDefaultOutputLabel(i),
      routedInput: Math.min(i, this.INPUT_COUNT - 1), // default: output N → input N
    }));

    this.locks = Array.from({ length: this.OUTPUT_COUNT }, () => 'U' as PortLock);
  }

  private getDefaultInputLabel(i: number): string {
    const labels = [
      'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4',
      'HDMI 1', 'HDMI 2', 'Computer 1', 'Computer 2',
      'Media Player 1', 'Media Player 2', 'Blu-ray', 'Stream Deck',
      'Aux 1', 'Aux 2', 'Aux 3', 'Aux 4',
      'Graphics 1', 'Graphics 2', 'Spare 1', 'Spare 2',
    ];
    return labels[i] || `Input ${i + 1}`;
  }

  private getDefaultOutputLabel(i: number): string {
    const labels = [
      'Program Out', 'Projector 1', 'Projector 2', 'Monitor 1',
      'Monitor 2', 'Recording 1', 'Recording 2', 'Stream Out',
      'FOH Screen', 'Stage Left', 'Stage Right', 'Green Room',
      'Lobby 1', 'Lobby 2', 'Overflow 1', 'Overflow 2',
      'Aux Out 1', 'Aux Out 2', 'Spare Out 1', 'Spare Out 2',
    ];
    return labels[i] || `Output ${i + 1}`;
  }

  private emitState(): void {
    const state: VideohubState = {
      connected: this._connected,
      modelName: 'Smart Videohub 20×20 (Mock)',
      videoInputs: this.INPUT_COUNT,
      videoOutputs: this.OUTPUT_COUNT,
      inputs: this.inputs.map((i) => ({ ...i })),
      outputs: this.outputs.map((o) => ({ ...o })),
      locks: [...this.locks],
      protocolVersion: '2.3',
    };
    this.lastEmittedState = state;
    this.emit('videohubState', state);
  }
}
