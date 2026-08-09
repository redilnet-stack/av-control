import type { EventEmitter } from 'node:events';

/**
 * Shared interface that both the real X32Driver and MockX32Driver implement.
 * Used to avoid union-type issues with differently-typed EventEmitter signatures.
 */
export interface X32DriverHandle {
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setChannelMute(channel: number, mute: boolean): void;
  setChannelFader(channel: number, level01: number): void;
  setDcaMute(dca: number, mute: boolean): void;
  setDcaFader(dca: number, level01: number): void;
  setAuxInMute(aux: number, mute: boolean): void;
  setAuxInFader(aux: number, level01: number): void;
  setFxRtnMute(rtn: number, mute: boolean): void;
  setFxRtnFader(rtn: number, level01: number): void;
  setMainMute(mute: boolean): void;
  setMainFader(level01: number): void;
  recallScene(scene: number): void;
  refreshState(): void;
  on(event: string | symbol, listener: (...args: unknown[]) => void): EventEmitter;
  removeAllListeners(event?: string | symbol): EventEmitter;
}
