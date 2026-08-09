import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import type { Role } from '../../config/settings-schema.js';

const KEY_LENGTH = 64;

/** Session lifetime: 7 days. */
export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** Hash a password with a fresh random salt (scrypt, constant-ish compare). */
export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return { salt, hash: derived.toString('hex') };
}

/** Verify a password against a stored salt + hash. */
export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(expectedHash, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

let secretPromise: Promise<string> | null = null;

/**
 * Resolve the JWT signing secret:
 * 1. $JWT_SECRET env var (must be ≥ 16 chars)
 * 2. A persistent random file next to the settings file (survives restarts)
 */
export function getJwtSecret(settingsDir: string): Promise<string> {
  if (!secretPromise) {
    secretPromise = resolveJwtSecret(settingsDir);
  }
  return secretPromise;
}

async function resolveJwtSecret(settingsDir: string): Promise<string> {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }

  const secretPath = path.join(settingsDir, 'jwt-secret');
  try {
    const existing = await readFile(secretPath, 'utf-8');
    const trimmed = existing.trim();
    if (trimmed) return trimmed;
  } catch {
    // File missing — generate below.
  }

  const secret = randomBytes(32).toString('hex');
  await mkdir(path.dirname(secretPath), { recursive: true });
  try {
    await writeFile(secretPath, secret, { encoding: 'utf-8', flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  return (await readFile(secretPath, 'utf-8')).trim();
}

export interface TokenPayload {
  sub: string;
  username: string;
  role: Role;
}

/** Sign a session token for the given user. */
export async function signToken(
  user: { id: string; username: string; role: Role },
  settingsDir: string,
): Promise<string> {
  const secret = await getJwtSecret(settingsDir);
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    secret,
    { expiresIn: TOKEN_TTL_MS / 1000 },
  );
}

/** Verify a session token. Returns null when invalid or expired. */
export async function verifyToken(token: string, settingsDir: string): Promise<TokenPayload | null> {
  try {
    const secret = await getJwtSecret(settingsDir);
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'string') return null;
    const payload = decoded as jwt.JwtPayload;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.username !== 'string' ||
      (payload.role !== 'admin' && payload.role !== 'operator')
    ) {
      return null;
    }
    return { sub: payload.sub, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}
