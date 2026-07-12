/**
 * Common types for all device modules.
 */

export type DeviceStatus = 'connected' | 'disconnected' | 'error';
export type DeviceId = 'x32' | 'atem' | 'videohub' | 'broadlink' | 'outlets';

/** Base interface every device driver must implement. */
export interface DeviceDriver {
  readonly id: DeviceId;
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): DeviceStatus;
}

/** A generic device event emitted over WebSocket. */
export interface DeviceEvent {
  device: DeviceId;
  type: string;
  data: unknown;
  timestamp: number;
}
