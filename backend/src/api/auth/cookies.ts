import type { IncomingHttpHeaders } from 'node:http';

/** Name of the httpOnly session cookie. */
export const AUTH_COOKIE = 'av_token';

/** Parse a Cookie header into a name → value map (safe against malformed input). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

/** Extract the auth token from a Cookie header, or null. */
export function getTokenFromCookies(header: string | undefined): string | null {
  return parseCookies(header)[AUTH_COOKIE] ?? null;
}
