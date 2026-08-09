import { z } from 'zod';

/** Schema for the entire app settings persisted on disk. */
export const AppSettingsSchema = z.object({
  mockDevices: z.boolean().default(false),

  zoom: z.object({
    enabled: z.boolean().default(false),
    s2sClientId: z.string().default(''),
    s2sClientSecret: z.string().default(''),
    accountId: z.string().default(''),
    sdkKey: z.string().default(''),
    sdkSecret: z.string().default(''),
  }),

  devices: z.object({
    x32: z.object({
      host: z.string().default(''),
      port: z.number().int().positive().default(10023),
      enabled: z.boolean().default(true),
    }),
    atem: z.object({
      host: z.string().default(''),
      port: z.number().int().positive().default(9910),
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
      tv: z.array(z.object({
        id: z.string(),
        label: z.string().default('TV'),
        type: z.enum(['tapo', 'tasmota', 'etekcity']).default('tapo'),
        host: z.string().default(''),
        enabled: z.boolean().default(false),
      })).default([]),
      amp: z.object({
        type: z.enum(['tapo', 'tasmota', 'etekcity']).default('tapo'),
        host: z.string().default(''),
        enabled: z.boolean().default(false),
      }),
    }),
    projector: z.object({
      enabled: z.boolean().default(false),
      irCodes: z.object({
        powerOn: z.string().default(''),
        powerOff: z.string().default(''),
        hdmi1: z.string().default(''),
        hdmi2: z.string().default(''),
        hdmi3: z.string().default(''),
        blank: z.string().default(''),
      }),
    }),
    screen: z.object({
      enabled: z.boolean().default(false),
      upStopDelay: z.number().int().min(0).default(3),
      irCodes: z.object({
        up: z.string().default(''),
        down: z.string().default(''),
        stop: z.string().default(''),
      }),
    }),
  }),

  /** Tapo cloud credentials (required for Tapo KLAP plug control). */
  tapo: z.object({
    email: z.string().default(''),
    password: z.string().default(''),
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
    zoom: z.string().default('Zoom'),
  }),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

/** Default settings used when no config file exists. */
export const DEFAULT_SETTINGS: AppSettings = {
  mockDevices: false,
  zoom: {
    enabled: false,
    s2sClientId: '',
    s2sClientSecret: '',
    accountId: '',
    sdkKey: '',
    sdkSecret: '',
  },
  devices: {
    x32: { host: '', port: 10023, enabled: true },
    atem: { host: '', port: 9910, enabled: false },
    videohub: { host: '', port: 9990, enabled: false },
    broadlink: { host: '', autoDiscover: true, enabled: false },
    outlets: {
      tv: [{ id: 'tv-1', label: 'TV 1', type: 'tapo', host: '', enabled: false }],
      amp: { type: 'tapo', host: '', enabled: false },
    },
    projector: {
      enabled: false,
      irCodes: {
        powerOn: '',
        powerOff: '',
        hdmi1: '',
        hdmi2: '',
        hdmi3: '',
        blank: '',
      },
    },
    screen: {
      enabled: false,
      upStopDelay: 3,
      irCodes: {
        up: '',
        down: '',
        stop: '',
      },
    },
  },
  tapo: {
    email: '',
    password: '',
  },
  labels: {
    x32: 'X32 Mixer',
    atem: 'ATEM Switcher',
    videohub: 'Videohub Router',
    projector: 'Projector',
    screen: 'Projector Screen',
    tv: 'Samsung TV',
    amp: 'NU4-6000 Amp',
    zoom: 'Zoom',
  },
};

/** The settings shape as exposed to the frontend (flattened for ease-of-use). */
export interface TvOutletConfig {
  id: string;
  label: string;
  type: 'tapo' | 'tasmota' | 'etekcity';
  host: string;
  enabled: boolean;
}

export type SettingsFrontend = {
  mockDevices: boolean;
  zoom: {
    enabled: boolean;
    s2sClientId: string;
    s2sClientSecret: string;
    accountId: string;
    sdkKey: string;
    sdkSecret: string;
  };
  x32: { host: string; port: number; enabled: boolean };
  atem: { host: string; port: number; enabled: boolean };
  videohub: { host: string; port: number; enabled: boolean };
  broadlink: { host: string; autoDiscover: boolean; enabled: boolean };
  tvOutlets: TvOutletConfig[];
  ampOutlet: { type: string; host: string; enabled: boolean };
  projector: {
    enabled: boolean;
    irCodes: {
      powerOn: string;
      powerOff: string;
      hdmi1: string;
      hdmi2: string;
      hdmi3: string;
      blank: string;
    };
  };
  screen: {
    enabled: boolean;
    upStopDelay: number;
    irCodes: {
      up: string;
      down: string;
      stop: string;
    };
  };
  tapo: { email: string; password: string };
  labels: Record<string, string>;
};

/** Convert nested AppSettings to a flat frontend-friendly shape. */
export function toFrontend(s: AppSettings): SettingsFrontend {
  return {
    mockDevices: s.mockDevices,
    zoom: s.zoom,
    x32: s.devices.x32,
    atem: s.devices.atem,
    videohub: s.devices.videohub,
    broadlink: s.devices.broadlink,
    tvOutlets: s.devices.outlets.tv.map((o) => ({
      id: o.id,
      label: o.label,
      type: o.type,
      host: o.host,
      enabled: o.enabled,
    })),
    ampOutlet: s.devices.outlets.amp,
    tapo: s.tapo,
    projector: s.devices.projector,
    screen: s.devices.screen,
    labels: s.labels,
  };
}

/** Convert flat frontend shape back to nested AppSettings. */
export function fromFrontend(f: SettingsFrontend): AppSettings {
  return {
    mockDevices: f.mockDevices,
    zoom: f.zoom,
    devices: {
      x32: f.x32,
      atem: f.atem,
      videohub: f.videohub,
      broadlink: f.broadlink,
      outlets: {
        tv: f.tvOutlets.map((o) => ({
          id: o.id,
          label: o.label,
          type: o.type as 'tapo' | 'tasmota' | 'etekcity',
          host: o.host,
          enabled: o.enabled,
        })),
        amp: { ...f.ampOutlet, type: f.ampOutlet.type as 'tapo' | 'tasmota' | 'etekcity' },
      },
      projector: f.projector,
      screen: f.screen,
    },
    tapo: { email: f.tapo.email, password: f.tapo.password },
    labels: f.labels as AppSettings['labels'],
  };
}
