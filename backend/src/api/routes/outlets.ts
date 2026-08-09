import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../logger.js';
import { OutletService } from '../../devices/outlets/outlet-service.js';
import type { SettingsStore } from '../../config/settings-store.js';

/**
 * API routes for controlling TV (and other) smart outlets.
 */
export function createOutletRouter(settings: SettingsStore): Router {
  const router = Router();
  const outletService = new OutletService(settings.settingsDir());

  /** Push current Tapo credentials into the service. */
  function syncTapoCredentials(): void {
    const s = settings.get();
    outletService.setTapoCredentials(s.tapo.email, s.tapo.password);
  }

  /** Get the list of configured TV outlets from settings. */
  function getTvOutlets() {
    return settings.get().devices.outlets.tv;
  }

  // Load last-known states from disk (no network calls)
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  outletService.loadPersistedStates();

  // Keep credentials in sync on settings changes
  syncTapoCredentials();
  settings.on('change', () => syncTapoCredentials());

  /**
   * GET /api/outlets — return power state for all configured TV outlets.
   */
  router.get('/', async (_req: Request, res: Response) => {
    const configs = getTvOutlets();
    const states = await outletService.getStates(configs);
    res.json({ outlets: states });
  });

  /**
   * GET /api/outlets/:id — return power state for a specific outlet.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    const config = getTvOutlets().find((o) => o.id === req.params.id);
    if (!config) {
      res.status(404).json({ error: 'Outlet not found' });
      return;
    }
    const state = await outletService.getState(config);
    res.json(state);
  });

  /**
   * POST /api/outlets/:id/on — power on an outlet.
   */
  router.post('/:id/on', async (req: Request, res: Response) => {
    const config = getTvOutlets().find((o) => o.id === req.params.id);
    if (!config) {
      res.status(404).json({ error: 'Outlet not found' });
      return;
    }
    const ok = await outletService.powerOn(config);
    if (ok) {
      res.json({ ok: true, id: config.id, state: 'on' });
    } else {
      res.status(500).json({ ok: false, error: 'Failed to power on' });
    }
  });

  /**
   * POST /api/outlets/:id/off — power off an outlet.
   */
  router.post('/:id/off', async (req: Request, res: Response) => {
    const config = getTvOutlets().find((o) => o.id === req.params.id);
    if (!config) {
      res.status(404).json({ error: 'Outlet not found' });
      return;
    }
    const ok = await outletService.powerOff(config);
    if (ok) {
      res.json({ ok: true, id: config.id, state: 'off' });
    } else {
      res.status(500).json({ ok: false, error: 'Failed to power off' });
    }
  });

  /**
   * POST /api/outlets/refresh — fetch live state from all devices.
   */
  router.post('/refresh', async (_req: Request, res: Response) => {
    const configs = getTvOutlets().filter((o) => o.enabled && o.host);
    const results = await Promise.allSettled(
      configs.map((c) => outletService.refreshDevice(c)),
    );
    const outlets = results.map((r) =>
      r.status === 'fulfilled' ? r.value : null,
    ).filter(Boolean) as Awaited<ReturnType<typeof outletService.refreshDevice>>[];
    res.json({ outlets });
  });

  /**
   * POST /api/outlets/:id/refresh — fetch live state for a single device.
   */
  router.post('/:id/refresh', async (req: Request, res: Response) => {
    const config = getTvOutlets().find((o) => o.id === req.params.id);
    if (!config) {
      res.status(404).json({ error: 'Outlet not found' });
      return;
    }
    const state = await outletService.refreshDevice(config);
    res.json(state);
  });

  /**
   * POST /api/outlets/:id/toggle — toggle power state.
   */
  router.post('/:id/toggle', async (req: Request, res: Response) => {
    const config = getTvOutlets().find((o) => o.id === req.params.id);
    if (!config) {
      res.status(404).json({ error: 'Outlet not found' });
      return;
    }
    const ok = await outletService.toggle(config);
    if (ok) {
      res.json({ ok: true, id: config.id, state: 'toggled' });
    } else {
      res.status(500).json({ ok: false, error: 'Failed to toggle' });
    }
  });

  return router;
}
