import { z } from 'zod';

/** Schema for the entire app settings persisted on disk. */
export const AppSettingsSchema = z.object({
  mockDevices: z.boolean().default(false),

  devices: z.object({
    x32: z.object({
      host: z.string().default(''),
      port: z.number().int().positive().default(10023),
      enabled: z.boolean().default(true),
    }),
    atem: z.object({
      host: z.string().default(''),
      port: z.number().int().positive().default(9990),
      enabled: z.boolean().default(false),
    }),
    videohub: z.object({
      host: z.string().default(''),
      port: z.number().int().positive().default(9990),
      enabled: z.boolean().default(false),
    }),
    broadlink: z.object({
      host: z.string().default(''),
      autoDiscover: z.boolean().default(true),
      enabled: z.boolean().default(false),
    }),
    outlets: z.object({
      tv: z.object({
        type: z.enum(['tapo', 'tasmota', 'etekcity']).default('tapo'),
        host: z.string().default(''),
        enabled: z.boolean().default(false),
      }),
      amp: z.object({
        type: z.enum(['tapo', 'tasmota', 'etekcity']).default('tapo'),
        host: z.string().default(''),
        enabled: z.boolean().default(false),
      }),
    }),
  }),

  /** Optional description / label for each device (free text). */
  labels: z.object({
    x32: z.string().default('X32 Mixer'),
    atem: z.string().default('ATEM Switcher'),
    videohub: z.string().default('Videohub Router'),
    projector: z.string().default('Projector'),
    screen: z.string().default('Projector Screen'),
    tv: z.string().default('Samsung TV'),
    amp: z.string().default('NU4-6000 Amp'),
  }),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

/** Default settings used when no config file exists. */
export const DEFAULT_SETTINGS: AppSettings = {
  mockDevices: false,
  devices: {
    x32: { host: '', port: 10023, enabled: true },
    atem: { host: '', port: 9990, enabled: false },
    videohub: { host: '', port: 9990, enabled: false },
    broadlink: { host: '', autoDiscover: true, enabled: false },
    outlets: {
      tv: { type: 'tapo', host: '', enabled: false },
      amp: { type: 'tapo', host: '', enabled: false },
    },
  },
  labels: {
    x32: 'X32 Mixer',
    atem: 'ATEM Switcher',
    videohub: 'Videohub Router',
    projector: 'Projector',
    screen: 'Projector Screen',
    tv: 'Samsung TV',
    amp: 'NU4-6000 Amp',
  },
};

/** The settings shape as exposed to the frontend (flattened for ease-of-use). */
export type SettingsFrontend = {
  mockDevices: boolean;
  x32: { host: string; port: number; enabled: boolean };
  atem: { host: string; port: number; enabled: boolean };
  videohub: { host: string; port: number; enabled: boolean };
  broadlink: { host: string; autoDiscover: boolean; enabled: boolean };
  tvOutlet: { type: string; host: string; enabled: boolean };
  ampOutlet: { type: string; host: string; enabled: boolean };
  labels: Record<string, string>;
};

/** Convert nested AppSettings to a flat frontend-friendly shape. */
export function toFrontend(s: AppSettings): SettingsFrontend {
  return {
    mockDevices: s.mockDevices,
    x32: s.devices.x32,
    atem: s.devices.atem,
    videohub: s.devices.videohub,
    broadlink: s.devices.broadlink,
    tvOutlet: s.devices.outlets.tv,
    ampOutlet: s.devices.outlets.amp,
    labels: s.labels,
  };
}

/** Convert flat frontend shape back to nested AppSettings. */
export function fromFrontend(f: SettingsFrontend): AppSettings {
  return {
    mockDevices: f.mockDevices,
    devices: {
      x32: f.x32,
      atem: f.atem,
      videohub: f.videohub,
      broadlink: f.broadlink,
      outlets: {
        tv: { ...f.tvOutlet, type: f.tvOutlet.type as 'tapo' | 'tasmota' | 'etekcity' },
        amp: { ...f.ampOutlet, type: f.ampOutlet.type as 'tapo' | 'tasmota' | 'etekcity' },
      },
    },
    labels: f.labels as AppSettings['labels'],
  };
}
