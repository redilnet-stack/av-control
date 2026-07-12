import { Router } from 'express';
import type { X32DriverHandle } from '../../devices/x32/driver-interface.js';
import { createX32Router } from './x32.js';

export function createApiRouter(x32Driver: X32DriverHandle): Router {
  const api = Router();

  api.use('/x32', createX32Router(x32Driver));

  // Health check
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  return api;
}
