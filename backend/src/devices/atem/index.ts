export { AtemDriver } from './atem.js';
export { MockAtemDriver } from './mock.js';
export type { AtemDriverHandle } from './driver-interface.js';
export * from './types.js';

import { config } from '../../config/index.js';
import { AtemDriver } from './atem.js';
import { MockAtemDriver } from './mock.js';
import type { AtemDriverHandle } from './driver-interface.js';

/**
 * Factory that returns either the real or mock ATEM driver
 * based on the MOCK_DEVICES config flag.
 */
export function createAtemDriver(): AtemDriverHandle {
  if (config.mockDevices) {
    return new MockAtemDriver();
  }
  return new AtemDriver({
    host: config.atem.ATEM_HOST,
    port: config.atem.ATEM_PORT,
  });
}
