/** Broadlink device connection state exposed to consumers. */
export interface BroadlinkState {
  connected: boolean;
  model: string;
  deviceType: number;
  host: string;
  mac: string;
}

/** Result of an IR learning operation. */
export interface LearnedCode {
  /** Hex string of the learned IR code. */
  code: string;
  /** Display name for this code. */
  name: string;
}
