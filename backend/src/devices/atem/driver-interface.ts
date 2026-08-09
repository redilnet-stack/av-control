import type { EventEmitter } from 'node:events';
import type { AtemSwitcherState } from './types.js';

/**
 * Shared interface that both the real AtemDriver and MockAtemDriver implement.
 * Used to avoid union-type issues with differently-typed EventEmitter signatures.
 */
export interface AtemDriverHandle {
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Set the program input on a mix effect (default ME 0). */
  changeProgramInput(inputId: number, me?: number): Promise<void>;
  /** Set the preview input on a mix effect (default ME 0). */
  changePreviewInput(inputId: number, me?: number): Promise<void>;
  /** Perform a cut transition. */
  cut(me?: number): Promise<void>;
  /** Perform an auto transition. */
  autoTransition(me?: number): Promise<void>;
  /** Set transition position (0.0 – 1.0) for T-bar control. */
  setTransitionPosition(position: number, me?: number): Promise<void>;
  /** Re-query current state from the ATEM. */
  refreshState(): void;

  /** Get the most recently emitted state snapshot (or null if none). */
  getLastState(): AtemSwitcherState | null;

  on(event: string | symbol, listener: (...args: unknown[]) => void): EventEmitter;
  removeAllListeners(event?: string | symbol): EventEmitter;
}
