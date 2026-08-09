import { EventEmitter } from 'node:events';
import { Atem } from 'atem-connection';
import type { AtemState } from 'atem-connection';
import { logger } from '../../logger.js';
import type { AtemConfig, AtemInputInfo, AtemSwitcherState } from './types.js';
import type { AtemDriverHandle } from './driver-interface.js';

export class AtemDriver extends EventEmitter implements AtemDriverHandle {
  private atem: Atem;
  private config: AtemConfig;
  private _connected = false;
  private lastEmittedState: AtemSwitcherState | null = null;

  constructor(config: AtemConfig) {
    super();
    this.config = config;
    this.atem = new Atem();
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    if (!this.config.host) {
      throw new Error('ATEM host not configured');
    }

    this.atem.on('connected', () => {
      this._connected = true;
      logger.info(`ATEM connected to ${this.config.host}:${this.config.port}`);
      this.emit('connected');
      this.emitState();
    });

    this.atem.on('disconnected', () => {
      this._connected = false;
      logger.warn('ATEM disconnected');
      this.emit('disconnected');
    });

    this.atem.on('stateChanged', (state: AtemState) => {
      this.emitState(state);
    });

    this.atem.on('error', (err: string) => {
      logger.error('ATEM error', { error: err });
      this.emit('error', new Error(err));
    });

    this.atem.on('info', (msg: string) => {
      logger.info(`ATEM info: ${msg}`);
    });

    try {
      await this.atem.connect(this.config.host, this.config.port);
      // Re-emit state now that library state is likely available
      this.emitState();
    } catch (err) {
      this._connected = false;
      logger.error('ATEM connection failed', { error: (err as Error).message });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    try {
      await this.atem.disconnect();
    } catch {
      // ignore
    }
    logger.info('ATEM disconnected');
    this.emit('disconnected');
  }

  async changeProgramInput(inputId: number, me = 0): Promise<void> {
    if (!this._connected) {
      logger.warn('ATEM not connected, cannot change program input');
      return;
    }
    try {
      await this.atem.changeProgramInput(inputId, me);
      logger.info(`ATEM ME${me} program input → ${inputId}`);
    } catch (err) {
      logger.error('Failed to change program input', { error: (err as Error).message });
    }
  }

  async changePreviewInput(inputId: number, me = 0): Promise<void> {
    if (!this._connected) {
      logger.warn('ATEM not connected, cannot change preview input');
      return;
    }
    try {
      await this.atem.changePreviewInput(inputId, me);
      logger.info(`ATEM ME${me} preview input → ${inputId}`);
    } catch (err) {
      logger.error('Failed to change preview input', { error: (err as Error).message });
    }
  }

  async cut(me = 0): Promise<void> {
    if (!this._connected) {
      logger.warn('ATEM not connected, cannot cut');
      return;
    }
    try {
      await this.atem.cut(me);
      logger.info(`ATEM ME${me} cut`);
      this.emit('cut', me);
    } catch (err) {
      logger.error('Failed to cut', { error: (err as Error).message });
    }
  }

  async autoTransition(me = 0): Promise<void> {
    if (!this._connected) {
      logger.warn('ATEM not connected, cannot auto transition');
      return;
    }
    try {
      await this.atem.autoTransition(me);
      logger.info(`ATEM ME${me} auto transition`);
      this.emit('autoTransition', me);
    } catch (err) {
      logger.error('Failed to auto transition', { error: (err as Error).message });
    }
  }

  async setTransitionPosition(position: number, me = 0): Promise<void> {
    if (!this._connected) {
      logger.warn('ATEM not connected, cannot set transition position');
      return;
    }
    const clamped = Math.max(0, Math.min(1, position));
    try {
      await this.atem.setTransitionPosition(clamped, me);
      logger.debug(`ATEM ME${me} transition position → ${clamped}`);
    } catch (err) {
      logger.error('Failed to set transition position', { error: (err as Error).message });
    }
  }

  refreshState(): void {
    if (this.lastEmittedState && !this.atem.state) {
      // Library state not yet populated — re-emit last good cached state
      this.emit('atemState', this.lastEmittedState);
      this.emit('programInput', this.lastEmittedState.programInput);
      this.emit('previewInput', this.lastEmittedState.previewInput);
    } else {
      this.emitState();
    }
  }

  getLastState(): AtemSwitcherState | null {
    return this.lastEmittedState;
  }

  private emitState(externalState?: AtemState): void {
    const state = this.buildState(externalState);
    // Cache only when we have real data — skip empty fallback states so
    // lastEmittedState retains the last good state from a stateChanged event.
    if (externalState || this.atem.state) {
      this.lastEmittedState = state;
    }
    this.emit('atemState', state);
    this.emit('programInput', state.programInput);
    this.emit('previewInput', state.previewInput);
  }

  /** Build a simplified ATEM state snapshot from the library state. */
  buildState(externalState?: AtemState): AtemSwitcherState {
    // Prefer state from event parameter (always populated), fall back to getter
    const libState = externalState ?? this.atem.state;
    if (!libState) {
      return {
        connected: this._connected,
        programInput: 0,
        previewInput: 0,
        transitionPosition: 0,
        transitionInTransition: false,
        meCount: 1,
        inputs: [],
      };
    }

    const meCount = libState.video?.mixEffects?.length ?? 1;
    const me0 = libState.video?.mixEffects?.[0];
    const programInput = me0?.programInput ?? 0;
    const previewInput = me0?.previewInput ?? 0;
    const transitionPos = me0?.transitionPosition?.handlePosition ?? 0;
    const inTransition = me0?.transitionPosition?.inTransition ?? false;

    const inputs: AtemInputInfo[] = [];
    if (libState.inputs) {
      for (const [idStr, input] of Object.entries(libState.inputs)) {
        const inputId = parseInt(idStr, 10);
        inputs.push({
          inputId,
          longName: (input as { longName?: string }).longName ?? `Input ${inputId}`,
          shortName: (input as { shortName?: string }).shortName ?? `In${inputId}`,
          isProgram: inputId === programInput,
          isPreview: inputId === previewInput,
        });
      }
    }

    return {
      connected: this._connected,
      programInput,
      previewInput,
      transitionPosition: transitionPos,
      transitionInTransition: inTransition,
      meCount,
      inputs,
    };
  }
}
