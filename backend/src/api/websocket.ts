import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../logger.js';
import type { PublicUser } from '../config/settings-schema.js';
import { getTokenFromCookies } from './auth/cookies.js';

let io: SocketIOServer | null = null;

type RefreshCallback = () => void;

/** Verifies the session token from a WebSocket handshake. */
export type SocketAuthFn = (token: string | null) => Promise<PublicUser | null> | PublicUser | null;

/**
 * Initialise the WebSocket server on top of the HTTP server.
 * `onClientConnect` is called every time a new WebSocket client connects,
 * allowing the server to push current device state to late-joining clients.
 * `socketAuth` (when provided) rejects handshakes without a valid session.
 */
export function initWebSocket(
  httpServer: HttpServer,
  onClientConnect?: RefreshCallback,
  socketAuth?: SocketAuthFn,
): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 10_000,
    pingTimeout: 5_000,
  });

  if (socketAuth) {
    io.use(async (socket, next) => {
      try {
        const user = await socketAuth(getTokenFromCookies(socket.handshake.headers.cookie));
        if (!user) {
          next(new Error('unauthorized'));
          return;
        }
        socket.data.user = user;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  io.on('connection', (socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`);

    // Push current device state so the newly-connected client has it
    onClientConnect?.();

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
