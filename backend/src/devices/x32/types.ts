import { z } from 'zod';

/** X32 channel types. */
export type X32ChannelType = 'input' | 'aux' | 'bus' | 'matrix' | 'dca' | 'main';

/** A channel identifier (e.g. "01" .. "32", "1" .. "16" for buses). */
export interface X32ChannelAddress {
  type: X32ChannelType;
  index: number; // 1-based
}

/** Fader level in dB (floating-point). -∞ to +10. */
export const FaderLevelSchema = z.number().min(-145).max(10);

/** Mute state. 0 = unmuted (audio passing), 1 = muted. */
export const MuteStateSchema = z.number().min(0).max(1);

/** Meters returned from /meters/{n} */
export interface X32MeterData {
  /** Raw meter values (0.0 – 1.0) for each channel in the meter group. */
  values: number[];
}

/** X32 connection settings. */
export interface X32Config {
  host?: string;
  port: number;
}

/** Snapshot of the current mixer state we care about. */
export interface X32MixerState {
  connected: boolean;
  channels: Record<string, X32ChannelState>;
  dcas: Record<string, X32DcaState>;
  main: X32MainState;
}

export interface X32ChannelState {
  index: number;
  name: string;
  mute: boolean;
  faderLevel: number; // dB
}

export interface X32DcaState {
  index: number;
  mute: boolean;
  faderLevel: number;
}

export interface X32MainState {
  mute: boolean;
  faderLevel: number;
}

/** OSC address patterns for the X32. */
export const OSC_PATTERNS = {
  channelOn: (ch: number) => `/ch/${String(ch).padStart(2, '0')}/mix/on`,
  channelFader: (ch: number) => `/ch/${String(ch).padStart(2, '0')}/mix/fader`,
  channelName: (ch: number) => `/ch/${String(ch).padStart(2, '0')}/config/name`,
  dcaOn: (dca: number) => `/dca/${dca}/on`,
  dcaFader: (dca: number) => `/dca/${dca}/fader`,
  mainOn: '/main/st/mix/on',
  mainFader: '/main/st/mix/fader',
  meters: (group: number) => `/meters/${group}`,
  muteGroup: (group: number) => `/config/mute/${group}`,
} as const;
