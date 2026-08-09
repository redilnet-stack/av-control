import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../logger.js';
import type { VideohubDriverHandle } from '../../devices/videohub/driver-interface.js';

/**
 * Create Videohub API routes.
 * Accepts a getter function so routes always use the current driver instance.
 */
export function createVideohubRouter(getDriver: () => VideohubDriverHandle | null): Router {
  const router = Router();

  /** Respond with 503 if no driver is available. */
  function requireDriver(res: Response): VideohubDriverHandle | null {
    const d = getDriver();
    if (!d) {
      res.status(503).json({ error: 'Videohub not connected or disabled' });
    }
    return d;
  }

  // ── Status ──────────────────────────────────────────────────────────

  router.get('/status', (_req: Request, res: Response) => {
    const d = getDriver();
    res.json({
      connected: d?.connected ?? false,
      mock: d ? d.constructor.name === 'MockVideohubDriver' : false,
    });
  });

  // ── State (full routing table + labels) ─────────────────────────────

  router.get('/state', (_req: Request, res: Response) => {
    const d = getDriver();
    if (!d) {
      res.status(503).json({ error: 'Videohub not connected or disabled' });
      return;
    }
    const state = d.getLastState();
    if (!state) {
      res.json({ connected: false, inputs: [], outputs: [] });
      return;
    }
    res.json(state);
  });

  // ── Set Route ───────────────────────────────────────────────────────

  const routeBodySchema = z.object({
    output: z.number().int().min(0),
    input: z.number().int().min(0),
  });

  router.put('/route', async (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = routeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { output, input } = parsed.data;
    await d.setRoute(output, input);
    logger.info(`Videohub route: output ${output} → input ${input}`);
    res.json({ output, input });
  });

  // ── Set Label ───────────────────────────────────────────────────────

  const labelBodySchema = z.object({
    portType: z.enum(['input', 'output']),
    portId: z.number().int().min(0),
    label: z.string().min(1).max(32),
  });

  router.put('/label', async (req: Request, res: Response) => {
    const d = requireDriver(res);
    if (!d) return;

    const parsed = labelBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { portType, portId, label } = parsed.data;

    try {
      if (portType === 'input') {
        await d.setInputLabel(portId, label);
      } else {
        await d.setOutputLabel(portId, label);
      }
      logger.info(`Videohub ${portType} ${portId} label → "${label}"`);
      res.json({ portType, portId, label });
    } catch (err) {
      logger.error('Failed to set Videohub label', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to set label' });
    }
  });

  // ── Get Route for a single output ───────────────────────────────────

  router.get('/route/:output', (req: Request, res: Response) => {
    const d = getDriver();
    if (!d) {
      res.status(503).json({ error: 'Videohub not connected or disabled' });
      return;
    }

    const output = parseInt(String(req.params.output), 10);
    const state = d.getLastState();
    if (!state || !state.outputs[output]) {
      res.status(404).json({ error: `Output ${output} not found` });
      return;
    }

    res.json({
      output,
      input: state.outputs[output].routedInput,
      label: state.outputs[output].label,
    });
  });

  return router;
}
