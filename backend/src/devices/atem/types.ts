import { z } from 'zod';

/** ATEM connection settings. */
export interface AtemConfig {
  host?: string;
  port: number;
}

/** Snapshot of ATEM switcher state we expose to the frontend. */
export interface AtemSwitcherState {
  connected: boolean;
  programInput: number;
  previewInput: number;
  transitionPosition: number;
  transitionInTransition: boolean;
  meCount: number;
  inputs: AtemInputInfo[];
}

export interface AtemInputInfo {
  inputId: number;
  longName: string;
  shortName: string;
  /** Whether this input is currently on program (ME 0). */
  isProgram: boolean;
  /** Whether this input is currently on preview (ME 0). */
  isPreview: boolean;
}
