export interface Settings {
  mockDevices: boolean;
  x32: DeviceConfig;
  atem: DeviceConfig;
  videohub: DeviceConfig;
  broadlink: {
    host: string;
    autoDiscover: boolean;
    enabled: boolean;
  };
  tvOutlet: OutletConfig;
  ampOutlet: OutletConfig;
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
