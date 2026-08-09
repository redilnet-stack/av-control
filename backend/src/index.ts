import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { config } from './config/index.js';
import { logger } from './logger.js';
import { initWebSocket } from './api/websocket.js';
import { createApiRouter } from './api/routes/index.js';
import { SettingsStore } from './config/settings-store.js';
import { DeviceManager } from './devices/manager/device-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  logger.info('Jersey Systems AV Control starting...', {
    env: config.env,
    mockDevices: config.mockDevices,
  });

  const settings = new SettingsStore();
  const appSettings = await settings.load();

  const deviceManager = new DeviceManager();
  await deviceManager.applySettings(appSettings);

  settings.on('change', async (newSettings) => {
    await deviceManager.applySettings(newSettings);
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api', createApiRouter(
    () => deviceManager.getX32(),
    settings,
    deviceManager,
  ));

  if (config.env === 'production') {
    // Path resolved relative to this file, not cwd — works from dist or src.
    const frontendDist = path.resolve(__dirname, '../../frontend/dist');
    app.use(express.static(frontendDist));

    // SPA fallback: serve index.html for client-side routes (e.g. /settings),
    // but never swallow API or WebSocket paths.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  const httpServer = createServer(app);
  initWebSocket(httpServer, () => {
    deviceManager.getX32()?.refreshState();
    deviceManager.getAtem()?.refreshState();
    deviceManager.getVideohub()?.refreshState();
  });

  httpServer.listen(config.port, config.host, () => {
    logger.info('Server listening on ' + config.host + ':' + config.port);
    logger.info('API: http://localhost:' + config.port + '/api');
    logger.info('Settings: http://localhost:' + config.port + '/api/settings');
    logger.info('Health: http://localhost:' + config.port + '/api/health');
    if (appSettings.mockDevices) {
      logger.info('Running with MOCK devices - no real hardware required');
    }
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});
