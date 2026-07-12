import { Router } from 'express';
import type { X32DriverHandle } from '../../devices/x32/driver-interface.js';
import type { SettingsStore } from '../../config/settings-store.js';
import type { DeviceManager } from '../../devices/manager/device-manager.js';
import { createX32Router } from './x32.js';
import { createSettingsRouter } from './settings/index.js';

export function createApiRouter(
  x32Driver: X32DriverHandle | null,
  settingsStore: SettingsStore,
  deviceManager: DeviceManager,
): Router {
  const api = Router();

  if (x32Driver) {
    api.use('/x32', createX32Router(x32Driver));
  } else {
    api.use('/x32', (_req, res) => {
      res.status(503).json({ error: 'X32 not configured or disabled' });
    });
  }

  api.use('/settings', createSettingsRouter(settingsStore, deviceManager));

  api.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      devices: deviceManager.getStatus(),
    });
  });

  return api;
}
