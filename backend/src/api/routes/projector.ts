import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../logger.js';
import type { BroadlinkService } from '../../devices/broadlink/broadlink-service.js';
import type { MockBroadlinkService } from '../../devices/broadlink/mock.js';
import type { SettingsStore } from '../../config/settings-store.js';

type BroadlinkHandle = BroadlinkService | MockBroadlinkService;

/** Valid projector IR command names. */
const PROJECTOR_COMMANDS = ['powerOn', 'powerOff', 'hdmi1', 'hdmi2', 'hdmi3', 'blank'] as const;
type ProjectorCommand = (typeof PROJECTOR_COMMANDS)[number];

/** Valid screen IR command names. */
const SCREEN_COMMANDS = ['up', 'down', 'stop'] as const;
type ScreenCommand = (typeof SCREEN_COMMANDS)[number];

/**
 * Create projector & screen API routes.
 * Uses the Broadlink service to send IR codes configured in settings.
 */
export function createProjectorRouter(
  getBroadlink: () => BroadlinkHandle | null,
  settings: SettingsStore,
): Router {
  const router = Router();

  /** Responds with 503 if no Broadlink is available. */
  function requireBroadlink(res: Response): BroadlinkHandle | null {
    const b = getBroadlink();
    if (!b || !b.connected) {
      res.status(503).json({ error: 'Broadlink not connected or disabled' });
    }
    return b;
  }

  // ── Status ──────────────────────────────────────────────────────────

  router.get('/status', (_req: Request, res: Response) => {
    const b = getBroadlink();
    const appSettings = settings.get();
    const projCfg = appSettings.devices.projector;
    const screenCfg = appSettings.devices.screen;

    res.json({
      broadlinkConnected: b?.connected ?? false,
      broadlinkMock: b ? b.constructor.name === 'MockBroadlinkService' : false,
      projectorEnabled: projCfg.enabled,
      screenEnabled: screenCfg.enabled,
      hasIrCodes: {
        projector: Object.values(projCfg.irCodes).some((c) => c.length > 0),
        screen: Object.values(screenCfg.irCodes).some((c) => c.length > 0),
      },
    });
  });

  // ── Send projector IR command ───────────────────────────────────────

  const projectorBodySchema = z.object({
    command: z.enum(PROJECTOR_COMMANDS),
  });

  router.post('/projector', async (req: Request, res: Response) => {
    const b = requireBroadlink(res);
    if (!b) return;

    const parsed = projectorBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid command', details: parsed.error.flatten() });
      return;
    }

    const { command } = parsed.data as { command: ProjectorCommand };
    const irCodes = settings.get().devices.projector.irCodes;
    const hexCode = irCodes[command];

    if (!hexCode) {
      res.status(400).json({
        error: `IR code for '${command}' not configured. Learn the code first in Settings.`,
      });
      return;
    }

    try {
      await b.sendIr(hexCode);
      logger.info(`Projector IR command: ${command}`);
      res.json({ ok: true, command });
    } catch (err) {
      logger.error('Failed to send projector IR', { command, error: (err as Error).message });
      res.status(500).json({ error: `Failed to send IR: ${(err as Error).message}` });
    }
  });

  // ── Screen auto-stop timer ──────────────────────────────────────────
  // Auto-sends 'stop' after a configurable delay when 'up' is pressed,
  // so the screen motor doesn't run indefinitely.

  let pendingScreenStop: ReturnType<typeof setTimeout> | null = null;

  function cancelPendingScreenStop(): void {
    if (pendingScreenStop !== null) {
      clearTimeout(pendingScreenStop);
      pendingScreenStop = null;
    }
  }

  // ── Send screen IR command ──────────────────────────────────────────

  const screenBodySchema = z.object({
    command: z.enum(SCREEN_COMMANDS),
  });

  router.post('/screen', async (req: Request, res: Response) => {
    const b = requireBroadlink(res);
    if (!b) return;

    const parsed = screenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid command', details: parsed.error.flatten() });
      return;
    }

    const { command } = parsed.data as { command: ScreenCommand };

    // Cancel any pending auto-stop — user is doing something else
    cancelPendingScreenStop();

    const appSettings = settings.get();
    const irCodes = appSettings.devices.screen.irCodes;
    const hexCode = irCodes[command];

    if (!hexCode) {
      res.status(400).json({
        error: `IR code for '${command}' not configured. Learn the code first in Settings.`,
      });
      return;
    }

    try {
      await b.sendIr(hexCode);
      logger.info(`Screen IR command: ${command}`);
      res.json({ ok: true, command });

      // If raising the screen, schedule an automatic stop after the configured delay
      if (command === 'up') {
        const delaySec = appSettings.devices.screen.upStopDelay;
        const stopCode = irCodes.stop;

        if (delaySec > 0 && stopCode) {
          pendingScreenStop = setTimeout(async () => {
            try {
              await b.sendIr(stopCode);
              logger.info('Screen auto-stopped after up delay', { delaySec });
            } catch (err) {
              logger.error('Screen auto-stop failed', { error: (err as Error).message });
            }
          }, delaySec * 1000);
        }
      }
    } catch (err) {
      logger.error('Failed to send screen IR', { command, error: (err as Error).message });
      // Make sure we don't leave a stale response
      if (!res.headersSent) {
        res.status(500).json({ error: `Failed to send IR: ${(err as Error).message}` });
      }
    }
  });

  // ── Learn IR code ───────────────────────────────────────────────────

  const learnBodySchema = z.object({
    device: z.enum(['projector', 'screen']),
    command: z.string().min(1),
  });

  router.post('/learn', async (req: Request, res: Response) => {
    const b = requireBroadlink(res);
    if (!b) return;

    const parsed = learnBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const { device, command } = parsed.data;

    try {
      const hexCode = await b.startLearning(15_000);
      logger.info(`IR code learned for ${device}.${command}`);

      // Persist the learned code into settings
      const currentSettings = settings.get();

      if (device === 'projector') {
        const validCmds = new Set<string>(PROJECTOR_COMMANDS);
        if (!validCmds.has(command)) {
          res.status(400).json({ error: `Unknown projector command: ${command}` });
          return;
        }
        (currentSettings.devices.projector.irCodes as Record<string, string>)[command] = hexCode;
      } else {
        const validCmds = new Set<string>(SCREEN_COMMANDS);
        if (!validCmds.has(command)) {
          res.status(400).json({ error: `Unknown screen command: ${command}` });
          return;
        }
        (currentSettings.devices.screen.irCodes as Record<string, string>)[command] = hexCode;
      }

      await settings.update(currentSettings);
      logger.info(`IR code saved for ${device}.${command}`);

      res.json({ ok: true, code: hexCode, device, command });
    } catch (err) {
      logger.error('Learning failed', { device, command, error: (err as Error).message });
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
