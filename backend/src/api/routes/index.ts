import { Router } from 'express';
import type { X32DriverHandle } from '../../devices/x32/driver-interface.js';
import type { AtemDriverHandle } from '../../devices/atem/driver-interface.js';
import type { VideohubDriverHandle } from '../../devices/videohub/driver-interface.js';
import type { BroadlinkService } from '../../devices/broadlink/broadlink-service.js';
import type { MockBroadlinkService } from '../../devices/broadlink/mock.js';
import type { SettingsStore } from '../../config/settings-store.js';
import type { DeviceManager } from '../../devices/manager/device-manager.js';
import { createAuthRouter } from './auth.js';
import { createAuthMiddleware } from '../auth/middleware.js';
import { createX32Router } from './x32.js';
import { createAtemRouter } from './atem.js';
import { createVideohubRouter } from './videohub.js';
import { createSettingsRouter } from './settings/index.js';
import { createProjectorRouter } from './projector.js';
import { createZoomRouter } from './zoom.js';
import { createOutletRouter } from './outlets.js';

export async function createApiRouter(
  getX32Driver: () => X32DriverHandle | null,
  settingsStore: SettingsStore,
  deviceManager: DeviceManager,
): Promise<Router> {
  const api = Router();
  const { requireAuth, requireAdmin } = await createAuthMiddleware(settingsStore);

  // Auth routes must stay public; everything else requires a session.
  api.use('/auth', await createAuthRouter(settingsStore));
  api.use(requireAuth);

  api.use('/x32', createX32Router(getX32Driver));
  api.use('/atem', createAtemRouter(() => deviceManager.getAtem()));
  api.use('/videohub', createVideohubRouter(() => deviceManager.getVideohub()));

  api.use('/projector', createProjectorRouter(
    () => deviceManager.getBroadlink() as (BroadlinkService | MockBroadlinkService | null),
    settingsStore,
    () => deviceManager.reconnectBroadlink(settingsStore.get()),
  ));

  api.use('/zoom', createZoomRouter(settingsStore));

  api.use('/outlets', createOutletRouter(settingsStore));

  // Settings are admin-only (device config + credentials live there).
  api.use('/settings', requireAdmin, createSettingsRouter(settingsStore, deviceManager));

  api.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      devices: deviceManager.getStatus(),
    });
  });

  return api;
}
