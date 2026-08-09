import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../logger.js';
import type { AtemDriverHandle } from '../../devices/atem/driver-interface.js';

/**
 * Create ATEM API routes.
 * Accepts a getter function so the routes always use the current driver,
 * even after the device manager reconnects with a new instance.
 */
export function createAtemRouter(getDriver: () => AtemDriverHandle | null): Router {
  const router = Router();

  /** Respond with 503 if no driver is available. */
  function requireDriver(res: Response): AtemDriverHandle | null {
    const d = getDriver();
    if (!d) {
      res.status(503).json({ error: 'ATEM not connected or disabled' });
    }
    return d;
  }

  // ── Status ──────────────────────────────────────────────────────────

  router.get('/status', (_req: Request, res: Response) => {
    const d = getDriver();
    res.json({
      connected: d?.connected ?? false,
      mock: d ? d.constructor.name === 'MockAtemDriver' : false,
    });
  });

  // ── Program Input ───────────────────────────────────────────────────

  const inputBodySchema = z.object({
    inputId: z.number().int().min(0),
    me: z.number().int().min(0).optional(),
  });

  router.put('/program', async (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = inputBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { inputId, me } = parsed.data;
    await d.changeProgramInput(inputId, me);
    logger.info(`ATEM program input → ${inputId}${me !== undefined ? ` (ME${me})` : ''}`);
    res.json({ inputId, me: me ?? 0 });
  });

  // ── Preview Input ───────────────────────────────────────────────────

  router.put('/preview', async (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = inputBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { inputId, me } = parsed.data;
    await d.changePreviewInput(inputId, me);
    logger.info(`ATEM preview input → ${inputId}${me !== undefined ? ` (ME${me})` : ''}`);
    res.json({ inputId, me: me ?? 0 });
  });

  // ── Cut Transition ──────────────────────────────────────────────────

  const meBodySchema = z.object({
    me: z.number().int().min(0).optional(),
  });

  router.post('/cut', async (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = meBodySchema.safeParse(req.body);
    const me = parsed.success ? parsed.data.me : undefined;
    await d.cut(me);
    logger.info('ATEM cut');
    res.json({ ok: true, me: me ?? 0 });
  });

  // ── Auto Transition ─────────────────────────────────────────────────

  router.post('/auto', async (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = meBodySchema.safeParse(req.body);
    const me = parsed.success ? parsed.data.me : undefined;
    await d.autoTransition(me);
    logger.info('ATEM auto transition');
    res.json({ ok: true, me: me ?? 0 });
  });

  // ── Transition Position (T-bar) ─────────────────────────────────────

  const tbarBodySchema = z.object({
    position: z.number().min(0).max(1),
    me: z.number().int().min(0).optional(),
  });

  router.put('/transition', async (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = tbarBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { position, me } = parsed.data;
    await d.setTransitionPosition(position, me);
    res.json({ position, me: me ?? 0 });
  });

  return router;
}
