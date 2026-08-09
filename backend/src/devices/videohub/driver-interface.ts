import type { EventEmitter } from 'node:events';
import type { VideohubState } from './types.js';

/**
 * Shared interface that both the real VideohubDriver and MockVideohubDriver implement.
 */
export interface VideohubDriverHandle {
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Route an input to an output. */
  setRoute(output: number, input: number): Promise<void>;

  /** Rename an input port label. */
  setInputLabel(inputId: number, label: string): Promise<void>;
  /** Rename an output port label. */
  setOutputLabel(outputId: number, label: string): Promise<void>;

  /** Request a full state refresh from the device. */
  refreshState(): void;

  /** Get the most recently emitted state snapshot (or null if none). */
  getLastState(): VideohubState | null;

  on(event: string | symbol, listener: (...args: unknown[]) => void): EventEmitter;
  removeAllListeners(event?: string | symbol): EventEmitter;
}
