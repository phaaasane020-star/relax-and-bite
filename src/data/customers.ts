// Customer accounts: sign in with an email code or with Google.
// - Codes are 6 digits, stored only as a hash, work once, for 10 minutes, with 5 tries
// - A new code at most once a minute, 5 an hour per email, 20 an hour per device
// - Google: the standard sign-in page; we check the answer with Google directly

import { randomBytes, randomInt } from 'node:crypto';
import { sql, sqlOne, UserError } from '../lib/supabase';
import { hashCode, hashToken, sameHash } from '../lib/sign';
import { brandedHtml, sendEmail } from '../lib/email';
import { serverEnv } from '../lib/env';
import { normalizePhone, phoneProblem } from '../lib/format';

export type Customer = { id: string; email: string; name: string; phone: string | null };

export const CODE_MINUTES = 10;
export const MAX_TRIES = 5;
export const RESEND_SECONDS = 60;
const PER_EMAIL_HOUR = 5;
const PER_DEVICE_HOUR = 20;
const COLS = 'id, email, name, phone';

/** A sign-in problem; wrong: true when it was a wrong guess (logged as a failed sign-in). */
export class CodeError extends UserError {
  constructor(
    message: string,
    readonly wrong = false,
    /** Seconds before another code can be asked for */
    readonly wait = 0,
  ) {
    super(message);
  }
}

/** "  Ama@Gmail.com " -> "ama@gmail.com", or null if it isn't an email address. */
export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? '').trim().toLowerCase();
  if (e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e)) return null;
  return e;
}

export async function getCustomer(id: string | undefined | null): Promise<Customer | undefined> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return sqlOne<Customer>(`select ${COLS} from customer_users where id = $1::uuid`, [id]);
}

/** The account for this email (made on first sign-in). */
async function upsertCustomer(email: string, extra: { googleSub?: string; name?: string } = {}): Promise<Customer> {
  const row = await sqlOne<Customer>(
    `insert into customer_users (email, name, google_sub, last_signin_at)
     values ($1, coalesce($2, ''), $3, now())
     on conflict (email) do update set
       last_signin_at = now(),
       google_sub = coalesce(customer_users.google_sub, excluded.google_sub),
       name = case when customer_users.name = '' then excluded.name else customer_users.name end
     returning ${COLS}`,
    [email, extra.name?.slice(0, 80) ?? null, extra.googleSub ?? null],
  );
  return row!;
}

/** Is there an account for this email yet? */
export async function customerExists(email: string): Promise<boolean> {
  return Boolean(await sqlOne('select 1 as x from customer_users where email = $1', [email]));
}

/** Their name from sign-up (only if the account has none yet). */
export async function setNameIfEmpty(customerId: string, raw: string): Promise<string> {
  const name = raw.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const row = await sqlOne<{ name: string }>(
    `update customer_users set name = case when name = '' then $2 else name end where id = $1::uuid returning name`,
    [customerId, name],
  );
  return row?.name ?? name;
}

/** "Edit profile": the name on the account and the phone number used at checkout. */
export async function updateProfile(customerId: string, rawName: string, rawPhone: string): Promise<Customer> {
  const name = rawName.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (name.length < 2) throw new UserError('Enter your name.');
  let phone: string | null = null;
  if (rawPhone.trim()) {
    const problem = phoneProblem(rawPhone);
    if (problem) throw new UserError(problem);
    phone = normalizePhone(rawPhone);
  }
  const row = await sqlOne<Customer>(
    'update customer_users set name = $2, phone = $3 where id = $1::uuid returning id, email, name, phone',
    [customerId, name, phone],
  );
  if (!row) throw new UserError('Your account was not found. Sign in again.');
  return row;
}

/** Remembered for next time: the phone number they ordered with. */
export async function rememberPhone(customerId: string, phone: string): Promise<void> {
  await sql('update customer_users set phone = $2 where id = $1::uuid and phone is distinct from $2 returning id', [customerId, phone]);
}

// ---------- Email codes ----------

/**
 * Makes a new code and emails it. With testMode (no email service while
 * developing), nothing is sent and the code is returned to show on screen.
 */
export async function startEmailSignIn(email: string, ip: string, opts: { testMode: boolean }): Promise<{ resendIn: number; testCode?: string }> {
  const device = ip && ip !== 'this computer' ? ip : '';
  const recent = await sqlOne<{ last_age: number | null; email_hour: number; device_hour: number }>(
    `select extract(epoch from now() - max(created_at) filter (where email = $1))::int as last_age,
       count(*) filter (where email = $1)::int as email_hour,
       count(*) filter (where $2 <> '' and ip = $2)::int as device_hour
     from customer_email_codes
     where created_at > now() - interval '1 hour' and (email = $1 or ($2 <> '' and ip = $2))`,
    [email, device],
  );
  const lastAge = recent?.last_age;
  if (lastAge != null && lastAge < RESEND_SECONDS) {
    const wait = RESEND_SECONDS - lastAge;
    throw new CodeError(`Wait ${wait} seconds before asking for another code.`, false, wait);
  }
  if ((recent?.email_hour ?? 0) >= PER_EMAIL_HOUR) throw new CodeError('Too many codes for this email. Try again in an hour, or contact support if you need help.');
  if ((recent?.device_hour ?? 0) >= PER_DEVICE_HOUR) throw new CodeError('Too many sign-in attempts from this device. Try again later.');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const row = await sqlOne<{ id: number }>(
    `insert into customer_email_codes (email, code_hash, expires_at, ip)
     values ($1, $2, now() + make_interval(mins => $3::int), nullif($4, '')) returning id`,
    [email, hashCode(email, code), CODE_MINUTES, device],
  );

  if (opts.testMode) return { resendIn: RESEND_SECONDS, testCode: code };

  try {
    await sendEmail({
      to: email,
      subject: `${code} is your Relax&Bite code`,
      text: `Your Relax&Bite code is ${code}\nEnter it in the app to sign in. It expires in ${CODE_MINUTES} minutes.\nIf you didn't ask for this, you can ignore this email. Don't share the code with anyone, not even Relax&Bite staff.`,
      html: brandedHtml({
        heading: 'Your sign-in code',
        lines: [
          `Enter this code in Relax&Bite to sign in:`,
          code.split('').join(' '),
          `It expires in ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email. Don't share the code with anyone, not even Relax&Bite staff.`,
        ],
      }),
    });
  } catch (e) {
    // Not sent, so it doesn't count towards the limits
    await sql('delete from customer_email_codes where id = $1::bigint returning id', [row!.id]);
    throw new CodeError((e as Error).message);
  }
  return { resendIn: RESEND_SECONDS };
}

/** Checks a code and signs them in (making the account the first time). */
export async function verifyEmailSignIn(email: string, code: string): Promise<Customer> {
  const otp = await sqlOne<{ id: number; code_hash: string; attempts: number; expired: boolean }>(
    `select id, code_hash, attempts, expires_at < now() as expired
     from customer_email_codes where email = $1 and used_at is null
     order by created_at desc limit 1`,
    [email],
  );
  if (!otp) throw new CodeError('Ask for a new code: tap Resend code.');
  if (otp.expired) throw new CodeError('This code has expired. Tap Resend code to get a new one.');
  if (otp.attempts >= MAX_TRIES) throw new CodeError('Too many wrong tries. Tap Resend code to get a new one.');

  if (!sameHash(hashCode(email, code), otp.code_hash)) {
    const after = await sqlOne<{ attempts: number }>('update customer_email_codes set attempts = attempts + 1 where id = $1::bigint returning attempts', [otp.id]);
    const left = MAX_TRIES - (after?.attempts ?? MAX_TRIES);
    throw new CodeError(left > 0 ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Tap Resend code to get a new one.', true);
  }
  const used = await sqlOne(
    `update customer_email_codes set used_at = now()
     where id = $1::bigint and used_at is null and attempts < $2::int and expires_at > now() returning id`,
    [otp.id, MAX_TRIES],
  );
  if (!used) throw new CodeError('Ask for a new code: tap Resend code.');
  return upsertCustomer(email);
}

// ---------- Google ----------

function googleConfig() {
  const v = serverEnv();
  const base = (v.GOOGLE_API_URL || '').replace(/\/+$/, '');
  return {
    clientId: v.GOOGLE_CLIENT_ID.trim(),
    secret: v.GOOGLE_CLIENT_SECRET.trim(),
    authUrl: base ? `${base}/auth` : 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: base ? `${base}/token` : 'https://oauth2.googleapis.com/token',
    infoUrl: base ? `${base}/tokeninfo` : 'https://oauth2.googleapis.com/tokeninfo',
  };
}

export function googleReady(): boolean {
  const g = googleConfig();
  return Boolean(g.clientId && g.secret);
}

export function googleSignInUrl(redirectUri: string, state: string): string {
  const g = googleConfig();
  const q = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${g.authUrl}?${q}`;
}

/** Finishes Google sign-in: swaps the code for Google's answer, checks it with Google, signs them in. */
export async function finishGoogleSignIn(code: string, redirectUri: string): Promise<Customer> {
  const g = googleConfig();
  const tokenRes = await fetch(g.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.secret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);
  const token = (tokenRes && tokenRes.ok ? await tokenRes.json().catch(() => null) : null) as { id_token?: string } | null;
  if (!token?.id_token) throw new UserError("Google sign-in didn't finish. Please try again.");

  // Ask Google itself whether the answer is genuine and meant for us
  const infoRes = await fetch(`${g.infoUrl}?id_token=${encodeURIComponent(token.id_token)}`, { signal: AbortSignal.timeout(12000) }).catch(() => null);
  const info = (infoRes && infoRes.ok ? await infoRes.json().catch(() => null) : null) as
    | { aud?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string; exp?: string }
    | null;
  const verified = info?.email_verified === true || info?.email_verified === 'true';
  if (!info || info.aud !== g.clientId || !info.sub || !verified || Number(info.exp ?? 0) * 1000 < Date.now()) {
    throw new UserError("We couldn't confirm your Google account. Please try again, or use your email instead.");
  }
  const email = normalizeEmail(info.email);
  if (!email) throw new UserError('Your Google account has no email address we can use.');
  return upsertCustomer(email, { googleSub: info.sub, name: info.name });
}

// ---------- Google from the app ----------
// Google doesn't allow its sign-in inside apps' web views, so the app opens it
// in the phone's browser. When it's done, the browser hands a one-time ticket
// back to the app, which swaps it for a signed-in session.

export async function createAppTicket(customerId: string): Promise<string> {
  const ticket = randomBytes(24).toString('base64url');
  await sqlOne(
    `insert into app_signin_tickets (ticket_hash, user_id, expires_at) values ($1, $2::uuid, now() + interval '3 minutes') returning ticket_hash`,
    [hashToken(ticket), customerId],
  );
  return ticket;
}

export async function claimAppTicket(ticket: string): Promise<Customer | undefined> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(ticket)) return undefined;
  const row = await sqlOne<{ user_id: string }>(
    `update app_signin_tickets set used_at = now()
     where ticket_hash = $1 and used_at is null and expires_at > now() returning user_id`,
    [hashToken(ticket)],
  );
  return row ? getCustomer(row.user_id) : undefined;
}
