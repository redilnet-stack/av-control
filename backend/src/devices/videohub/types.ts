/** Videohub connection settings. */
export interface VideohubConfig {
  host?: string;
  port: number;
}

/** Info about a single input port. */
export interface VideohubInputInfo {
  inputId: number;
  label: string;
}

/** Info about a single output port. */
export interface VideohubOutputInfo {
  outputId: number;
  label: string;
  /** Which input ID is currently routed to this output. */
  routedInput: number;
}

/** Lock status for a port. */
export type PortLock = 'O' | 'L' | 'U';

/** Full snapshot of the Videohub state. */
export interface VideohubState {
  connected: boolean;
  modelName: string;
  videoInputs: number;
  videoOutputs: number;
  inputs: VideohubInputInfo[];
  outputs: VideohubOutputInfo[];
  locks: PortLock[];
  protocolVersion: string;
}
