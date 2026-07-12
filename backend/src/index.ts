import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { config } from './config/index.js';
import { logger } from './logger.js';
import { initWebSocket, broadcastDeviceEvent } from './api/websocket.js';
import { createApiRouter } from './api/routes/index.js';
import { createX32Driver } from './devices/x32/index.js';
import type { X32DriverHandle } from './devices/x32/driver-interface.js';

async function main(): Promise<void> {
  logger.info(`Jersey Systems AV Control starting...`, {
    env: config.env,
    mockDevices: config.mockDevices,
  });

  // ── Initialise devices ──────────────────────────────────────────────

  const x32: X32DriverHandle = createX32Driver();

  try {
    await x32.connect();
  } catch (err) {
    logger.error('X32 connection failed', {
      error: (err as Error).message,
    });
  }

  // ── Hook X32 events → WebSocket broadcasts ──────────────────────────

  x32.on('meter', (data: unknown) => {
    broadcastDeviceEvent('x32', 'meter', data);
  });
  x32.on('channelMute', (channel: unknown, muted: unknown) => {
    broadcastDeviceEvent('x32', 'channelMute', { channel, muted });
  });
  x32.on('channelFader', (channel: unknown, level: unknown) => {
    broadcastDeviceEvent('x32', 'channelFader', { channel, level });
  });
  x32.on('connected', () => {
    broadcastDeviceEvent('x32', 'connected', {});
  });
  x32.on('disconnected', () => {
    broadcastDeviceEvent('x32', 'disconnected', {});
  });

  // ── Express + HTTP + WebSocket ──────────────────────────────────────

  const app = express();
  app.use(cors());
  app.use(express.json());

  // API routes
  app.use('/api', createApiRouter(x32));

  // Serve frontend in production
  if (config.env === 'production') {
    app.use(express.static('../frontend/dist'));
  }

  const httpServer = createServer(app);
  initWebSocket(httpServer);

  // ── Start ───────────────────────────────────────────────────────────

  httpServer.listen(config.port, config.host, () => {
    logger.info(`Server listening on ${config.host}:${config.port}`);
    logger.info(`API: http://localhost:${config.port}/api`);
    logger.info(`Health: http://localhost:${config.port}/api/health`);
    if (config.mockDevices) {
      logger.info('⚠️  Running with MOCK devices — no real hardware required');
    }
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});
