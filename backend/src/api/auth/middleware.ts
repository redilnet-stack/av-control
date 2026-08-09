import type { Request, RequestHandler } from 'express';
import type { SettingsStore } from '../../config/settings-store.js';
import { toPublicUser, type PublicUser } from '../../config/settings-schema.js';
import { verifyToken } from './security.js';
import { getTokenFromCookies } from './cookies.js';

/** Express request extended with the authenticated user. */
export interface AuthRequest extends Request {
  user?: PublicUser;
}

export interface AuthMiddleware {
  /** Reject unauthenticated requests with 401. */
  requireAuth: RequestHandler;
  /** Reject non-admin requests with 403. */
  requireAdmin: RequestHandler;
  /** Resolve a user from a raw token (for WebSocket handshakes). */
  resolveUserFromToken: (token: string | null) => Promise<PublicUser | null>;
}

/**
 * Build auth middleware bound to the settings store.
 * Users are looked up from the store on every request, so role changes and
 * account deletions take effect immediately.
 */
export async function createAuthMiddleware(settings: SettingsStore): Promise<AuthMiddleware> {
  async function resolveUserFromToken(token: string | null): Promise<PublicUser | null> {
    if (!token) return null;
    const payload = await verifyToken(token, settings.settingsDir());
    if (!payload) return null;
    const stored = settings.get().users.find((u) => u.id === payload.sub);
    if (!stored) return null;
    return toPublicUser(stored);
  }

  async function resolveUser(req: Request): Promise<PublicUser | null> {
    return resolveUserFromToken(getTokenFromCookies(req.headers.cookie));
  }

  const requireAuth: RequestHandler = async (req, res, next) => {
    const user = await resolveUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    (req as AuthRequest).user = user;
    next();
  };

  const requireAdmin: RequestHandler = async (req, res, next) => {
    const user = await resolveUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden — admin required' });
      return;
    }
    (req as AuthRequest).user = user;
    next();
  };

  return { requireAuth, requireAdmin, resolveUserFromToken };
}
