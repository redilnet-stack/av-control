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
  zoom: z.object({
    enabled: z.boolean(),
    s2sClientId: z.string(),
    s2sClientSecret: z.string(),
    accountId: z.string(),
    sdkKey: z.string(),
    sdkSecret: z.string(),
  }),
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
  tvOutlets: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['tapo', 'tasmota', 'etekcity']),
    host: z.string(),
    enabled: z.boolean(),
  })),
  ampOutlet: z.object({
    type: z.enum(['tapo', 'tasmota', 'etekcity']),
    host: z.string(),
    enabled: z.boolean(),
  }),
  projector: z.object({
    enabled: z.boolean(),
    irCodes: z.object({
      powerOn: z.string(),
      powerOff: z.string(),
      hdmi1: z.string(),
      hdmi2: z.string(),
      hdmi3: z.string(),
      blank: z.string(),
    }),
  }),
  screen: z.object({
    enabled: z.boolean(),
    upStopDelay: z.number().int().min(0),
    irCodes: z.object({
      up: z.string(),
      down: z.string(),
      stop: z.string(),
    }),
  }),
  tapo: z.object({
    email: z.string(),
    password: z.string(),
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
      // update() validates, persists, and emits 'change' → triggers deviceManager.applySettings
      await settings.update(appSettings);
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

    if (device === 'x32') {
      try {
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

    if (device === 'videohub') {
      try {
        const { VideohubDriver } = await import('../../../devices/videohub/videohub.js');
        const driver = new VideohubDriver({ host, port: port ?? 9990 });
        await driver.connect();
        await driver.disconnect();
        res.json({ ok: true, message: `Connected to Videohub at ${host}:${port ?? 9990}` });
      } catch (err) {
        res.json({
          ok: false,
          message: `Failed: ${(err as Error).message}`,
        });
      }
      return;
    }

    if (device === 'atem') {
      try {
        const { AtemDriver } = await import('../../../devices/atem/atem.js');
        const driver = new AtemDriver({ host, port: port ?? 9990 });
        await driver.connect();
        await driver.disconnect();
        res.json({ ok: true, message: `Connected to ATEM at ${host}:${port ?? 9990}` });
      } catch (err) {
        res.json({
          ok: false,
          message: `Failed: ${(err as Error).message}`,
        });
      }
      return;
    }

    if (device === 'broadlink') {
      try {
        const { BroadlinkService } = await import('../../../devices/broadlink/broadlink-service.js');
        const svc = new BroadlinkService();
        await svc.connect(host);
        await svc.disconnect();
        // Promote the tested connection into the live service so the app
        // can use it immediately — otherwise the manager keeps its failed
        // (null) handle and saving settings does not retry.
        await deviceManager.reconnectBroadlink(settings.get());
        res.json({ ok: true, message: `Connected to Broadlink at ${host}` });
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
