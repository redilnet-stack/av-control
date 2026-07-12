export { X32Driver } from './x32.js';
export { MockX32Driver } from './mock.js';
export type { X32DriverHandle } from './driver-interface.js';
export * from './types.js';

import { config } from '../../config/index.js';
import { X32Driver } from './x32.js';
import { MockX32Driver } from './mock.js';
import type { X32DriverHandle } from './driver-interface.js';

/**
 * Factory that returns either the real or mock X32 driver
 * based on the MOCK_DEVICES config flag.
 */
export function createX32Driver(): X32DriverHandle {
  if (config.mockDevices) {
    return new MockX32Driver();
  }
  return new X32Driver({
    host: config.x32.X32_HOST,
    port: config.x32.X32_PORT,
  });
}

