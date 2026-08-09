import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { logger } from '../../logger.js';
import type { SettingsStore } from '../../config/settings-store.js';
import { toPublicUser, type StoredUser } from '../../config/settings-schema.js';
import { hashPassword, signToken, verifyPassword, TOKEN_TTL_MS } from '../auth/security.js';
import { createAuthMiddleware, type AuthRequest } from '../auth/middleware.js';
import { AUTH_COOKIE, getTokenFromCookies } from '../auth/cookies.js';

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(64),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128),
});

const createUserSchema = credentialsSchema.extend({
  role: z.enum(['admin', 'operator']),
});

const updateUserSchema = z.object({
  role: z.enum(['admin', 'operator']).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128).optional(),
});

function isSecureRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

/** Build the /api/auth router (status/setup/login/logout/me + admin user CRUD). */
export async function createAuthRouter(settings: SettingsStore): Promise<Router> {
  const router = Router();
  const { requireAuth, requireAdmin, resolveUserFromToken } =
    await createAuthMiddleware(settings);
  const settingsDir = settings.settingsDir();

  function setAuthCookie(req: Request, res: Response, token: string): void {
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest(req),
      path: '/',
      maxAge: TOKEN_TTL_MS,
    });
  }

  function clearAuthCookie(req: Request, res: Response): void {
    res.clearCookie(AUTH_COOKIE, { path: '/', secure: isSecureRequest(req) });
  }

  /** GET /api/auth/status — boot state for the SPA (public). */
  router.get('/status', async (req: Request, res: Response) => {
    const users = settings.get().users;
    const user = await resolveUserFromToken(getTokenFromCookies(req.headers.cookie));
    res.json({ setupRequired: users.length === 0, user });
  });

  /** POST /api/auth/setup — create the first admin account (public, one-time). */
  router.post('/setup', async (req: Request, res: Response) => {
    if (settings.get().users.length > 0) {
      res.status(409).json({ error: 'Setup has already been completed' });
      return;
    }
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid credentials', details: parsed.error.flatten() });
      return;
    }
    const username = parsed.data.username.toLowerCase();
    const { salt, hash } = await hashPassword(parsed.data.password);
    const admin: StoredUser = {
      id: randomUUID(),
      username,
      salt,
      hash,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    await settings.update({ users: [admin] });
    const token = await signToken(admin, settingsDir);
    setAuthCookie(req, res, token);
    logger.info('First admin account created', { username });
    res.json({ user: toPublicUser(admin) });
  });

  /** POST /api/auth/login — exchange credentials for a session cookie. */
  router.post('/login', async (req: Request, res: Response) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid credentials', details: parsed.error.flatten() });
      return;
    }
    const username = parsed.data.username.toLowerCase();
    const stored = settings.get().users.find((u) => u.username === username);
    if (!stored) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    const ok = await verifyPassword(parsed.data.password, stored.salt, stored.hash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    const token = await signToken(stored, settingsDir);
    setAuthCookie(req, res, token);
    logger.info('User logged in', { username });
    res.json({ user: toPublicUser(stored) });
  });

  /** POST /api/auth/logout — clear the session cookie (idempotent, public). */
  router.post('/logout', (req: Request, res: Response) => {
    clearAuthCookie(req, res);
    res.json({ ok: true });
  });

  /** GET /api/auth/me — current session user. */
  router.get('/me', requireAuth, (req: Request, res: Response) => {
    res.json({ user: (req as AuthRequest).user });
  });

  /** GET /api/auth/users — list accounts (admin only, no hashes). */
  router.get('/users', requireAdmin, (_req: Request, res: Response) => {
    res.json({ users: settings.get().users.map(toPublicUser) });
  });

  /** POST /api/auth/users — create an account (admin only). */
  router.post('/users', requireAdmin, async (req: Request, res: Response) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid user', details: parsed.error.flatten() });
      return;
    }
    const username = parsed.data.username.toLowerCase();
    const exists = settings.get().users.some((u) => u.username === username);
    if (exists) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    const { salt, hash } = await hashPassword(parsed.data.password);
    const user: StoredUser = {
      id: randomUUID(),
      username,
      salt,
      hash,
      role: parsed.data.role,
      createdAt: new Date().toISOString(),
    };
    await settings.update({ users: [...settings.get().users, user] });
    logger.info('User created', { username, role: user.role });
    res.json({ user: toPublicUser(user) });
  });

  /** PUT /api/auth/users/:id — change role and/or password (admin only). */
  router.put('/users/:id', requireAdmin, async (req: Request, res: Response) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid user update', details: parsed.error.flatten() });
      return;
    }
    const current = settings.get();
    const user = current.users.find((u) => u.id === req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const self = (req as AuthRequest).user;

    if (parsed.data.role && parsed.data.role !== user.role) {
      if (self && self.id === user.id) {
        res.status(400).json({ error: 'Cannot change your own role' });
        return;
      }
      if (user.role === 'admin' && parsed.data.role === 'operator') {
        const adminCount = current.users.filter((u) => u.role === 'admin').length;
        if (adminCount <= 1) {
          res.status(400).json({ error: 'Cannot demote the last admin' });
          return;
        }
      }
      user.role = parsed.data.role;
    }

    if (parsed.data.password) {
      const { salt, hash } = await hashPassword(parsed.data.password);
      user.salt = salt;
      user.hash = hash;
    }

    await settings.update({ users: current.users });
    logger.info('User updated', { username: user.username });
    res.json({ user: toPublicUser(user) });
  });

  /** DELETE /api/auth/users/:id — remove an account (admin only). */
  router.delete('/users/:id', requireAdmin, async (req: Request, res: Response) => {
    const current = settings.get();
    const user = current.users.find((u) => u.id === req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const self = (req as AuthRequest).user;
    if (self && self.id === user.id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }
    if (user.role === 'admin' && current.users.filter((u) => u.role === 'admin').length <= 1) {
      res.status(400).json({ error: 'Cannot delete the last admin' });
      return;
    }
    await settings.update({ users: current.users.filter((u) => u.id !== user.id) });
    logger.info('User deleted', { username: user.username });
    res.json({ ok: true });
  });

  return router;
}
