// Server-only connection to Supabase. Every query goes through the app_sql
// function (supabase/03_app_bridge.sql) using the secret service key, which
// is read from .env and never sent to phones or browsers.
//
// Write queries with $1, $2 ... for values. They become ($1->>0), ($1->>1) ...
// inside the database, so add a cast where the column isn't text: $2::uuid,
// $3::numeric, $4::boolean, $5::jsonb (pass objects/arrays for jsonb).
// Writes must end with RETURNING so they report what changed.

import dns from 'node:dns';
import net from 'node:net';
import { serverEnv } from './env';

// Slow or patchy internet (a phone hotspot, say): Node tries the IPv6 address
// first and gives up on each address after a quarter of a second, which on a
// slow network ends in "took too long". Try IPv4 first and give each attempt
// longer. (Ignored where the platform doesn't allow it.)
try {
  dns.setDefaultResultOrder('ipv4first');
  net.setDefaultAutoSelectFamilyAttemptTimeout?.(2000);
} catch {
  /* not available here */
}

/** A problem the person can fix, safe to show on screen. */
export class UserError extends Error {}

function config(): { url: string; key: string } {
  const vars = serverEnv();
  // Accept the URL with or without the /rest/v1 ending Supabase shows on some screens
  const url = vars.SUPABASE_URL.trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '');
  const key = vars.SUPABASE_SERVICE_ROLE_KEY.trim();
  if (!url || !key) {
    throw new Error(
      `Supabase is not set up: ${!url ? 'SUPABASE_URL' : 'SUPABASE_SERVICE_ROLE_KEY'} is missing. Put both in a file named exactly .env in ${typeof process !== 'undefined' ? process.cwd() : 'the project folder'} (next to package.json), then restart npm run dev.`,
    );
  }
  return { url, key };
}

/** Turns $1, $2 ... into lookups in the single jsonb list app_sql receives. */
export function bindParams(query: string): string {
  return query.replace(/\$(\d+)/g, (_m, n: string) => `($1->>${Number(n) - 1})`);
}

function encode(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  // jsonb values travel as text and are cast back with ::jsonb
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** While developing: how long each database call took, so slow pages are easy to explain. */
function logQuery(query: string, ms: number): void {
  const what = query.replace(/\s+/g, ' ').trim().slice(0, 70);
  const flag = ms > 800 ? '  << slow' : '';
  console.log(`  [database] ${String(ms).padStart(5)} ms  ${what}${flag}`);
}

/** Connection problems where the request never left this computer (safe to send again). */
const NEVER_SENT = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH']);

function errorCode(e: unknown): string {
  const err = e as { name?: string; code?: string; cause?: { code?: string; name?: string } };
  return err?.cause?.code ?? err?.code ?? err?.cause?.name ?? err?.name ?? '';
}

/** Runs one statement and returns its rows. */
export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const { url, key } = config();
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys only use apikey
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  const started = Date.now();
  // A dropped or slow connection gets two more tries (after 0.4s, then 1.2s)
  // before the page shows an error. Changes are only retried when the request
  // never reached the database, so nothing is ever saved twice.
  const readOnly = /^\s*(select|with)\b/i.test(query) && !/\b(insert|update|delete)\b/i.test(query);
  let res: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 400 : 1200));
    try {
      res = await fetch(`${url}/rest/v1/rpc/app_sql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ q: bindParams(query), p: params.map(encode) }),
        signal: AbortSignal.timeout(20000),
      });
      // Supabase busy or waking up: worth another go
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 2 && readOnly) continue;
      break;
    } catch (e) {
      lastError = e;
      const code = errorCode(e);
      const neverSent = NEVER_SENT.has(code);
      if (!(neverSent || readOnly)) break;
    }
  }
  if (!res) {
    // Say why, so it's clear whether it's the internet, the address or Supabase
    const e = lastError;
    const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
    const code = errorCode(e);
    const host = url.replace(/^https?:\/\//, '');
    const why =
      code === 'ENOTFOUND' || code === 'EAI_AGAIN'
        ? `This computer couldn't find ${host}. Either there's no internet, or the project was just restored and isn't ready yet (wait a few minutes), or SUPABASE_URL in .env is wrong.`
        : code === 'ECONNREFUSED' || code === 'ECONNRESET'
          ? `${host} refused the connection. If the project was just restored, wait a few minutes and try again.`
          : code.includes('TIMEOUT') || code === 'TimeoutError'
            ? `${host} took too long to answer (tried 3 times). The internet is slow or dropping, or the project is paused: open supabase.com and check it says Active.`
            : `Check your internet connection and try again.${cause?.message ? ` (${code || 'details'}: ${cause.message})` : ''}`;
    throw new Error(`Can't reach the database. ${why}`);
  }

  const body = (await res.json().catch(() => null)) as unknown;
  if (import.meta.env.DEV) logQuery(query, Date.now() - started);
  if (!res.ok) {
    const err = (body ?? {}) as { code?: string; message?: string };
    // Database rules that protect the data, worded for people
    if (err.code === '23505') throw new UserError('That already exists.');
    if (err.code === '23514' || err.code === '23502') throw new UserError('Some details are missing or not valid. Check the form and try again.');
    if (res.status === 401 || res.status === 403) throw new Error('The database rejected the key. Check SUPABASE_SERVICE_ROLE_KEY in .env.');
    if (res.status === 404) {
      // PGRST202: Supabase is reachable but can't find the function
      if (err.code === 'PGRST202' || /function/i.test(err.message ?? '')) {
        throw new Error(
          `Supabase can't find the app_sql function (${err.code ?? '404'}: ${err.message ?? 'not found'}). Run supabase/03_app_bridge.sql in the SQL editor, then run: notify pgrst, 'reload schema';`,
        );
      }
      throw new Error(
        `Supabase answered "not found" for ${url}/rest/v1/rpc/app_sql. Check SUPABASE_URL in .env is exactly your Project URL (like https://abcd.supabase.co) and that the Data API is turned on (Project Settings > Data API).`,
      );
    }
    throw new Error(`Database error: ${err.message ?? res.statusText}`);
  }
  return (Array.isArray(body) ? body : []) as T[];
}

/** First row, or undefined. */
export async function sqlOne<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T | undefined> {
  return (await sql<T>(query, params))[0];
}
