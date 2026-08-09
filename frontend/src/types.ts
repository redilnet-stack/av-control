export interface Settings {
  mockDevices: boolean;
  zoom: {
    enabled: boolean;
    s2sClientId: string;
    s2sClientSecret: string;
    accountId: string;
    sdkKey: string;
    sdkSecret: string;
  };
  x32: DeviceConfig;
  atem: DeviceConfig;
  videohub: DeviceConfig;
  broadlink: {
    host: string;
    autoDiscover: boolean;
    enabled: boolean;
  };
  tvOutlets: TvOutletConfig[];
  ampOutlet: OutletConfig;
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
  tapo: {
    email: string;
    password: string;
  };
  labels: Record<string, string>;
}

export interface DeviceConfig {
  host: string;
  port: number;
  enabled: boolean;
}

export interface OutletConfig {
  type: 'tapo' | 'tasmota' | 'etekcity';
  host: string;
  enabled: boolean;
}

export interface TvOutletConfig {
  id: string;
  label: string;
  type: 'tapo' | 'tasmota' | 'etekcity';
  host: string;
  enabled: boolean;
}
