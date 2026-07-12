import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../logger.js';
import type { X32DriverHandle } from '../../devices/x32/driver-interface.js';

/**
 * Create X32 API routes.
 */
export function createX32Router(driver: X32DriverHandle): Router {
  const router = Router();

  // ── Status ──────────────────────────────────────────────────────────

  router.get('/status', (_req: Request, res: Response) => {
    res.json({
      connected: driver.connected,
      mock: driver.constructor.name === 'MockX32Driver',
    });
  });

  // ── Channel Mute ────────────────────────────────────────────────────

  const muteBodySchema = z.object({
    mute: z.union([z.boolean(), z.number().transform((v) => v === 1)]),
  });

  router.put('/channels/:channel/mute', (req: Request, res: Response) => {
    const ch = parseInt(String(req.params.channel), 10);
    if (ch < 1 || ch > 32) {
      res.status(400).json({ error: 'Channel must be 1-32' });
      return;
    }

    const parsed = muteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    driver.setChannelMute(ch, parsed.data.mute);
    logger.info(`X32 channel ${ch} mute → ${parsed.data.mute}`);
    res.json({ channel: ch, mute: parsed.data.mute });
  });

  // ── Channel Fader ───────────────────────────────────────────────────

  const faderBodySchema = z.object({
    level: z.number().min(0).max(1),
  });

  router.put('/channels/:channel/fader', (req: Request, res: Response) => {
    const ch = parseInt(String(req.params.channel), 10);
    if (ch < 1 || ch > 32) {
      res.status(400).json({ error: 'Channel must be 1-32' });
      return;
    }

    const parsed = faderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    driver.setChannelFader(ch, parsed.data.level);
    logger.info(`X32 channel ${ch} fader → ${parsed.data.level}`);
    res.json({ channel: ch, level: parsed.data.level });
  });

  // ── DCA Mute ────────────────────────────────────────────────────────

  router.put('/dcas/:dca/mute', (req: Request, res: Response) => {
    const dca = parseInt(String(req.params.dca), 10);
    if (dca < 1 || dca > 8) {
      res.status(400).json({ error: 'DCA must be 1-8' });
      return;
    }

    const parsed = muteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    driver.setDcaMute(dca, parsed.data.mute);
    logger.info(`X32 DCA ${dca} mute → ${parsed.data.mute}`);
    res.json({ dca, mute: parsed.data.mute });
  });

  // ── Main Mute ───────────────────────────────────────────────────────

  router.put('/main/mute', (req: Request, res: Response) => {
    const parsed = muteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    driver.setMainMute(parsed.data.mute);
    logger.info(`X32 main mute → ${parsed.data.mute}`);
    res.json({ mute: parsed.data.mute });
  });

  // ── Main Fader ──────────────────────────────────────────────────────

  router.put('/main/fader', (req: Request, res: Response) => {
    const parsed = faderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    driver.setMainFader(parsed.data.level);
    logger.info(`X32 main fader → ${parsed.data.level}`);
    res.json({ level: parsed.data.level });
  });

  // ── Scene Recall ────────────────────────────────────────────────────

  const sceneBodySchema = z.object({
    scene: z.number().int().min(1).max(100),
  });

  router.post('/scene', (req: Request, res: Response) => {
    const parsed = sceneBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    driver.recallScene(parsed.data.scene);
    logger.info(`X32 scene recall → ${parsed.data.scene}`);
    res.json({ scene: parsed.data.scene });
  });

  return router;
}
