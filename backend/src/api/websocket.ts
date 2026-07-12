import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../logger.js';

let io: SocketIOServer | null = null;

/**
 * Initialise the WebSocket server on top of the HTTP server.
 */
export function initWebSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*', // Restrict in production
      methods: ['GET', 'POST'],
    },
    pingInterval: 10_000,
    pingTimeout: 5_000,
  });

  io.on('connection', (socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket client disconnected: ${socket.id} (${reason})`);
    });

    socket.on('error', (err) => {
      logger.error(`WebSocket error from ${socket.id}`, { error: err.message });
    });
  });

  logger.info('WebSocket server initialised');
  return io;
}

/**
 * Broadcast a device event to all connected WebSocket clients.
 */
export function broadcastDeviceEvent(
  device: string,
  type: string,
  data: unknown,
): void {
  if (!io) {
    logger.warn('WebSocket not initialised, skipping broadcast');
    return;
  }
  io.emit('deviceEvent', {
    device,
    type,
    data,
    timestamp: Date.now(),
  });
}

/**
 * Get the Socket.IO server instance (for attaching listeners).
 */
export function getIO(): SocketIOServer | null {
  return io;
}
