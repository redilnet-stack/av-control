import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../../logger.js';
import type { SettingsStore } from '../../../config/settings-store.js';
import type { DeviceManager } from '../../../devices/manager/device-manager.js';
import {
  fromFrontend,
  type SettingsFrontend,
} from '../../../config/settings-schema.js';

const frontendSchema = z.object({
  mockDevices: z.boolean(),
  x32: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    enabled: z.boolean(),
  }),
  atem: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    enabled: z.boolean(),
  }),
  videohub: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    enabled: z.boolean(),
  }),
  broadlink: z.object({
    host: z.string(),
    autoDiscover: z.boolean(),
    enabled: z.boolean(),
  }),
  tvOutlet: z.object({
    type: z.enum(['tapo', 'tasmota', 'etekcity']),
    host: z.string(),
    enabled: z.boolean(),
  }),
  ampOutlet: z.object({
    type: z.enum(['tapo', 'tasmota', 'etekcity']),
    host: z.string(),
    enabled: z.boolean(),
  }),
  labels: z.record(z.string()),
});

export function createSettingsRouter(
  settings: SettingsStore,
  deviceManager: DeviceManager,
): Router {
  const router = Router();

  /** GET /api/settings — return current settings. */
  router.get('/', (_req: Request, res: Response) => {
    res.json(settings.getFrontend());
  });

  /** PUT /api/settings — replace settings and reconnect devices. */
  router.put('/', async (req: Request, res: Response) => {
    const parsed = frontendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid settings',
        details: parsed.error.flatten(),
      });
      return;
    }

    const flat = parsed.data as SettingsFrontend;
    const appSettings = fromFrontend(flat);

    try {
      await settings.update(appSettings);
      await deviceManager.applySettings(appSettings);
      logger.info('Settings saved and devices reconfigured');
      res.json({ ok: true, settings: settings.getFrontend() });
    } catch (err) {
      logger.error('Failed to apply settings', {
        error: (err as Error).message,
      });
      res.status(500).json({ error: 'Failed to apply settings' });
    }
  });

  /** POST /api/settings/test — test a device connection. */
  const testBodySchema = z.object({
    device: z.enum(['x32', 'atem', 'videohub', 'broadlink']),
    host: z.string(),
    port: z.number().int().positive().optional(),
  });

  router.post('/test', async (req: Request, res: Response) => {
    const parsed = testBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid test request',
        details: parsed.error.flatten(),
      });
      return;
    }

    const { device, host, port } = parsed.data;

    // For now only X32 test is implemented
    if (device === 'x32') {
      try {
        // Quick OSC ping — just try connecting
        const { X32Driver } = await import('../../../devices/x32/x32.js');
        const driver = new X32Driver({ host, port: port ?? 10023 });
        await driver.connect();
        await driver.disconnect();
        res.json({ ok: true, message: `Connected to X32 at ${host}:${port ?? 10023}` });
      } catch (err) {
        res.json({
          ok: false,
          message: `Failed: ${(err as Error).message}`,
        });
      }
      return;
    }

    res.json({ ok: false, message: `Test not implemented for ${device}` });
  });

  return router;
}
