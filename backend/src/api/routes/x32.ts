import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../logger.js';
import type { X32DriverHandle } from '../../devices/x32/driver-interface.js';

/**
 * Create X32 API routes.
 * Accepts a getter function so the routes always use the current driver,
 * even after the device manager reconnects with a new instance.
 */
export function createX32Router(getDriver: () => X32DriverHandle | null): Router {
  const router = Router();

  /** Respond with 503 if no driver is available. */
  function requireDriver(res: Response): X32DriverHandle | null {
    const d = getDriver();
    if (!d) {
      res.status(503).json({ error: 'X32 not connected or disabled' });
    }
    return d;
  }

  // ── Status ──────────────────────────────────────────────────────────

  router.get('/status', (_req: Request, res: Response) => {
    const d = getDriver();
    res.json({
      connected: d?.connected ?? false,
      mock: d ? d.constructor.name === 'MockX32Driver' : false,
    });
  });

  // ── Channel Mute ────────────────────────────────────────────────────

  const muteBodySchema = z.object({
    mute: z.union([z.boolean(), z.number().transform((v) => v === 1)]),
  });

  router.put('/channels/:channel/mute', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

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

    d.setChannelMute(ch, parsed.data.mute);
    logger.info(`X32 channel ${ch} mute → ${parsed.data.mute}`);
    res.json({ channel: ch, mute: parsed.data.mute });
  });

  // ── Channel Fader ───────────────────────────────────────────────────

  const faderBodySchema = z.object({
    level: z.number().min(0).max(1),
  });

  router.put('/channels/:channel/fader', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

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

    d.setChannelFader(ch, parsed.data.level);
    logger.info(`X32 channel ${ch} fader → ${parsed.data.level}`);
    res.json({ channel: ch, level: parsed.data.level });
  });

  // ── DCA Mute ────────────────────────────────────────────────────────

  router.put('/dcas/:dca/mute', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

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

    d.setDcaMute(dca, parsed.data.mute);
    logger.info(`X32 DCA ${dca} mute → ${parsed.data.mute}`);
    res.json({ dca, mute: parsed.data.mute });
  });

  // ── DCA Fader ───────────────────────────────────────────────────────

  router.put('/dcas/:dca/fader', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const dca = parseInt(String(req.params.dca), 10);
    if (dca < 1 || dca > 8) {
      res.status(400).json({ error: 'DCA must be 1-8' });
      return;
    }

    const parsed = faderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    d.setDcaFader(dca, parsed.data.level);
    logger.info(`X32 DCA ${dca} fader → ${parsed.data.level}`);
    res.json({ dca, level: parsed.data.level });
  });

  // ── Main Mute ───────────────────────────────────────────────────────

  router.put('/main/mute', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = muteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    d.setMainMute(parsed.data.mute);
    logger.info(`X32 main mute → ${parsed.data.mute}`);
    res.json({ mute: parsed.data.mute });
  });

  // ── Main Fader ──────────────────────────────────────────────────────

  router.put('/main/fader', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = faderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    d.setMainFader(parsed.data.level);
    logger.info(`X32 main fader → ${parsed.data.level}`);
    res.json({ level: parsed.data.level });
  });

  // ── AUX In Mute ─────────────────────────────────────────────────────

  router.put('/auxin/:aux/mute', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const aux = parseInt(String(req.params.aux), 10);
    if (aux < 1 || aux > 6) {
      res.status(400).json({ error: 'AUX must be 1-6' });
      return;
    }

    const parsed = muteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    d.setAuxInMute(aux, parsed.data.mute);
    res.json({ aux, mute: parsed.data.mute });
  });

  // ── AUX In Fader ────────────────────────────────────────────────────

  router.put('/auxin/:aux/fader', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const aux = parseInt(String(req.params.aux), 10);
    if (aux < 1 || aux > 6) {
      res.status(400).json({ error: 'AUX must be 1-6' });
      return;
    }

    const parsed = faderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    d.setAuxInFader(aux, parsed.data.level);
    res.json({ aux, level: parsed.data.level });
  });

  // ── FX Return Mute ──────────────────────────────────────────────────

  router.put('/fxrtn/:rtn/mute', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const rtn = parseInt(String(req.params.rtn), 10);
    if (rtn < 1 || rtn > 4) {
      res.status(400).json({ error: 'FX return must be 1-4' });
      return;
    }

    const parsed = muteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    d.setFxRtnMute(rtn, parsed.data.mute);
    res.json({ rtn, mute: parsed.data.mute });
  });

  // ── FX Return Fader ─────────────────────────────────────────────────

  router.put('/fxrtn/:rtn/fader', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const rtn = parseInt(String(req.params.rtn), 10);
    if (rtn < 1 || rtn > 4) {
      res.status(400).json({ error: 'FX return must be 1-4' });
      return;
    }

    const parsed = faderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    d.setFxRtnFader(rtn, parsed.data.level);
    res.json({ rtn, level: parsed.data.level });
  });

  // ── Scene Recall ────────────────────────────────────────────────────

  const sceneBodySchema = z.object({
    scene: z.number().int().min(1).max(100),
  });

  router.post('/scene', (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = sceneBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    d.recallScene(parsed.data.scene);
    logger.info(`X32 scene recall → ${parsed.data.scene}`);
    res.json({ scene: parsed.data.scene });
  });

  return router;
}
