// Tamper-proof cookies: the value plus a signature only the server can make.
// Someone editing the cookie in their browser (to pretend to be another phone
// number, or to see another person's order) gets a cookie the server rejects.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { serverEnv } from './env';

function secret(): string {
  // SESSION_SECRET if set, otherwise derived from the service key (never sent anywhere)
  const vars = serverEnv();
  const base = vars.SESSION_SECRET || vars.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('Add SUPABASE_SERVICE_ROLE_KEY (or SESSION_SECRET) to .env.');
  return createHash('sha256').update(`relax-and-bite-cookies|${base}`).digest('hex');
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');
const mac = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url');

export function signValue(value: unknown): string {
  const data = b64(JSON.stringify(value));
  return `${data}.${mac(data)}`;
}

export function readSigned<T>(cookie: string | undefined): T | null {
  if (!cookie) return null;
  const [data, sig] = cookie.split('.');
  if (!data || !sig) return null;
  const expected = Buffer.from(mac(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(unb64(data)) as T;
  } catch {
    return null;
  }
}

/** For storing session tokens: the database only keeps this hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Sign-in codes are stored only as this, tied to the phone number, so a database leak doesn't reveal them. */
export function hashCode(phone: string, code: string): string {
  return mac(`sign-in-code|${phone}|${code}`);
}

/** Compares two hashes without giving away how much matched. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
