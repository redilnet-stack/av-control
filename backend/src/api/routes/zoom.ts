import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../logger.js';
import type { SettingsStore } from '../../config/settings-store.js';
import { ZoomService } from '../../services/zoom.js';

/** Mask sensitive credential values for frontend display. */
function mask(str: string): string {
  if (str.length <= 8) return str ? '*'.repeat(str.length) : '';
  return str.slice(0, 4) + '*'.repeat(str.length - 8) + str.slice(-4);
}

export function createZoomRouter(
  settingsStore: SettingsStore,
): Router {
  const router = Router();

  // ── Lazy ZoomService singleton ──────────────────────────────────

  let zoomService: ZoomService | null = null;

  function getZoomService(): { service: ZoomService; configured: boolean } {
    const s = settingsStore.get();
    const zoomCfg = s.zoom;
    const configured = !!(zoomCfg.s2sClientId && zoomCfg.s2sClientSecret && zoomCfg.accountId);

    if (!zoomService) {
      zoomService = new ZoomService(zoomCfg);
    } else {
      zoomService.updateCredentials(zoomCfg);
    }

    return { service: zoomService, configured };
  }

  // ── GET /settings — return Zoom credentials (masked) ────────────

  router.get('/settings', (_req: Request, res: Response) => {
    const s = settingsStore.get().zoom;
    res.json({
      enabled: s.enabled,
      s2sClientId: mask(s.s2sClientId),
      s2sClientSecret: mask(s.s2sClientSecret),
      accountId: mask(s.accountId),
      sdkKey: mask(s.sdkKey),
      sdkSecret: mask(s.sdkSecret),
      fullyConfigured: !!(s.s2sClientId && s.s2sClientSecret && s.accountId),
    });
  });

  // ── PUT /settings — update Zoom credentials ─────────────────────

  const updateSettingsSchema = z.object({
    s2sClientId: z.string().optional(),
    s2sClientSecret: z.string().optional(),
    accountId: z.string().optional(),
    sdkKey: z.string().optional(),
    sdkSecret: z.string().optional(),
    enabled: z.boolean().optional(),
  });

  router.put('/settings', async (req: Request, res: Response) => {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const current = settingsStore.get();
    const updated = { ...current.zoom, ...parsed.data };
    current.zoom = updated;

    try {
      await settingsStore.update(current);
      logger.info('Zoom settings updated');
      res.json({ ok: true });
    } catch (err) {
      logger.error('Failed to update Zoom settings', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to save Zoom settings' });
    }
  });

  // ── POST /meetings — create a new meeting ───────────────────────

  const createMeetingSchema = z.object({
    topic: z.string().min(1).default('AV Control Room Meeting'),
    muteUponEntry: z.boolean().optional().default(false),
  });

  router.post('/meetings', async (req: Request, res: Response) => {
    const { service, configured } = getZoomService();
    if (!configured) {
      res.status(400).json({ error: 'Zoom not configured. Add credentials in Settings.' });
      return;
    }

    const parsed = createMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    try {
      const meeting = await service.createMeeting(parsed.data.topic, {
        muteUponEntry: parsed.data.muteUponEntry,
      });
      logger.info(`Zoom meeting created: ${meeting.id} — "${meeting.topic}"`);
      res.json(meeting);
    } catch (err) {
      logger.error('Failed to create Zoom meeting', { error: (err as Error).message });
      res.status(500).json({ error: `Failed to create meeting: ${(err as Error).message}` });
    }
  });

  // ── GET /meetings/:id — get meeting details ─────────────────────

  router.get('/meetings/:id', async (req: Request, res: Response) => {
    const { service, configured } = getZoomService();
    if (!configured) {
      res.status(400).json({ error: 'Zoom not configured.' });
      return;
    }

    const meetingId = parseInt(String(req.params.id), 10);
    if (isNaN(meetingId)) {
      res.status(400).json({ error: 'Invalid meeting ID' });
      return;
    }

    try {
      const meeting = await service.getMeeting(meetingId);
      res.json(meeting);
    } catch (err) {
      logger.error('Failed to get meeting', { meetingId, error: (err as Error).message });
      res.status(500).json({ error: `Failed to get meeting: ${(err as Error).message}` });
    }
  });

  // ── POST /meetings/:id/end — end a meeting ──────────────────────

  router.post('/meetings/:id/end', async (req: Request, res: Response) => {
    const { service, configured } = getZoomService();
    if (!configured) {
      res.status(400).json({ error: 'Zoom not configured.' });
      return;
    }

    const meetingId = parseInt(String(req.params.id), 10);
    if (isNaN(meetingId)) {
      res.status(400).json({ error: 'Invalid meeting ID' });
      return;
    }

    try {
      await service.endMeeting(meetingId);
      logger.info(`Zoom meeting ended: ${meetingId}`);
      res.json({ ok: true });
    } catch (err) {
      logger.error('Failed to end meeting', { meetingId, error: (err as Error).message });
      res.status(500).json({ error: `Failed to end meeting: ${(err as Error).message}` });
    }
  });

  // ── POST /meetings/:id/mute-all — mute all participants ─────────

  router.post('/meetings/:id/mute-all', async (req: Request, res: Response) => {
    const { service, configured } = getZoomService();
    if (!configured) {
      res.status(400).json({ error: 'Zoom not configured.' });
      return;
    }

    const meetingId = parseInt(String(req.params.id), 10);
    if (isNaN(meetingId)) {
      res.status(400).json({ error: 'Invalid meeting ID' });
      return;
    }

    try {
      await service.muteAll(meetingId, false);
      logger.info(`Muted all participants in meeting ${meetingId}`);
      res.json({ ok: true });
    } catch (err) {
      logger.error('Failed to mute all', { meetingId, error: (err as Error).message });
      res.status(500).json({ error: `Failed to mute all: ${(err as Error).message}` });
    }
  });

  // ── POST /meetings/:id/unmute-all — unmute all participants ─────

  router.post('/meetings/:id/unmute-all', async (req: Request, res: Response) => {
    const { service, configured } = getZoomService();
    if (!configured) {
      res.status(400).json({ error: 'Zoom not configured.' });
      return;
    }

    const meetingId = parseInt(String(req.params.id), 10);
    if (isNaN(meetingId)) {
      res.status(400).json({ error: 'Invalid meeting ID' });
      return;
    }

    try {
      await service.unmuteAll(meetingId);
      logger.info(`Unmuted all participants in meeting ${meetingId}`);
      res.json({ ok: true });
    } catch (err) {
      logger.error('Failed to unmute all', { meetingId, error: (err as Error).message });
      res.status(500).json({ error: `Failed to unmute all: ${(err as Error).message}` });
    }
  });

  // ── POST /meetings/:id/participants/:pid/mute — mute participant ─

  router.post('/meetings/:id/participants/:pid/mute', async (req: Request, res: Response) => {
    const { service, configured } = getZoomService();
    if (!configured) {
      res.status(400).json({ error: 'Zoom not configured.' });
      return;
    }

    const meetingId = parseInt(String(req.params.id), 10);
    const participantId = String(req.params.pid);
    if (isNaN(meetingId) || !participantId) {
      res.status(400).json({ error: 'Invalid meeting or participant ID' });
      return;
    }

    try {
      await service.muteParticipant(meetingId, participantId);
      logger.info(`Muted participant ${participantId} in meeting ${meetingId}`);
      res.json({ ok: true });
    } catch (err) {
      logger.error('Failed to mute participant', { meetingId, participantId, error: (err as Error).message });
      res.status(500).json({ error: `Failed to mute participant: ${(err as Error).message}` });
    }
  });

  // ── POST /meetings/:id/participants/:pid/unmute ─────────────────

  router.post('/meetings/:id/participants/:pid/unmute', async (req: Request, res: Response) => {
    const { service, configured } = getZoomService();
    if (!configured) {
      res.status(400).json({ error: 'Zoom not configured.' });
      return;
    }

    const meetingId = parseInt(String(req.params.id), 10);
    const participantId = String(req.params.pid);
    if (isNaN(meetingId) || !participantId) {
      res.status(400).json({ error: 'Invalid meeting or participant ID' });
      return;
    }

    try {
      await service.unmuteParticipant(meetingId, participantId);
      logger.info(`Unmuted participant ${participantId} in meeting ${meetingId}`);
      res.json({ ok: true });
    } catch (err) {
      logger.error('Failed to unmute participant', { meetingId, participantId, error: (err as Error).message });
      res.status(500).json({ error: `Failed to unmute participant: ${(err as Error).message}` });
    }
  });

  // ── GET /meetings/:id/participants — list participants ──────────

  router.get('/meetings/:id/participants', async (req: Request, res: Response) => {
    const { service, configured } = getZoomService();
    if (!configured) {
      res.status(400).json({ error: 'Zoom not configured.' });
      return;
    }

    const meetingId = parseInt(String(req.params.id), 10);
    if (isNaN(meetingId)) {
      res.status(400).json({ error: 'Invalid meeting ID' });
      return;
    }

    try {
      const participants = await service.listParticipants(meetingId);
      res.json({ participants });
    } catch (err) {
      // Zoom REST participants API only works for in-progress/past meetings.
      // SDK-joined meetings may not register participants here — return empty.
      logger.warn('Could not list participants (meeting may not be tracked by REST API)', {
        meetingId,
        error: (err as Error).message,
      });
      res.json({ participants: [] });
    }
  });

  // ── POST /signature — generate Meeting SDK signature ───────────

  const signatureSchema = z.object({
    meetingNumber: z.number().int().positive(),
    role: z.union([z.literal(0), z.literal(1)]).default(1),
  });

  router.post('/signature', async (req: Request, res: Response) => {
    const s = settingsStore.get().zoom;
    if (!s.sdkKey || !s.sdkSecret) {
      res.status(400).json({ error: 'Meeting SDK not configured. Set SDK Key & Secret in Settings.' });
      return;
    }

    const parsed = signatureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    try {
      const service = new ZoomService(s);
      const signature = service.generateSignature(parsed.data.meetingNumber, parsed.data.role);
      res.json({ signature, sdkKey: s.sdkKey });
    } catch (err) {
      logger.error('Failed to generate signature', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to generate signature' });
    }
  });

  return router;
}
