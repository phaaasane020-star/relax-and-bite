// Server-only connection to Paystack. The secret key comes from .env and is
// never sent to phones or browsers.
//
// How a payment works:
// 1. The order is saved as "waiting for payment".
//    - Mobile Money: we ask Paystack to send a prompt to the customer's phone
//      (charge) and they approve it there, without leaving the app.
//    - Card: we ask Paystack for a payment page (initialize) and the customer
//      types the card there, so card details never touch our server.
// 2. Paystack sends the customer back to us, and separately tells our server
//    (webhook). Either way we ask Paystack directly whether the payment
//    succeeded and for the right amount (verify) before the kitchen sees it.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from './env';

export type PaystackStatus = 'success' | 'failed' | 'abandoned' | 'reversed' | 'ongoing' | 'pending' | 'processing' | 'queued';

function config(): { base: string; secret: string } {
  const vars = serverEnv();
  return { base: (vars.PAYSTACK_API_URL || 'https://api.paystack.co').replace(/\/+$/, ''), secret: vars.PAYSTACK_SECRET_KEY.trim() };
}

/** true once a Paystack secret key is in .env. Without one, online orders are marked paid straight away (testing). */
export function paystackReady(): boolean {
  return config().secret.length > 0;
}

/** true with a sk_test_ key: no real money moves. */
export function paystackTestMode(): boolean {
  return config().secret.startsWith('sk_test_');
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const { base, secret } = config();
  if (!secret) throw new Error('Paystack is not set up: add PAYSTACK_SECRET_KEY to .env, then restart npm run dev.');
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("Couldn't reach Paystack. Check your internet connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (res.status === 401) throw new Error('Paystack rejected the key. Check PAYSTACK_SECRET_KEY in .env.');
  if (!res.ok || !json?.status) throw Object.assign(new Error(`Paystack: ${json?.message ?? res.statusText}`), { data: json?.data });
  return json.data as T;
}

/** GH₵ to pesewas, the unit Paystack counts in. */
export const toPesewas = (cedis: number) => Math.round(cedis * 100);

/** Asks Paystack for a payment page. Returns the address to send the customer to. */
export async function initializePayment(opts: {
  email: string;
  amount: number; // GH₵
  reference: string;
  callbackUrl: string;
  method: 'momo' | 'card';
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const data = await call<{ authorization_url: string }>('POST', '/transaction/initialize', {
    email: opts.email,
    amount: toPesewas(opts.amount),
    currency: 'GHS',
    reference: opts.reference,
    callback_url: opts.callbackUrl,
    channels: opts.method === 'momo' ? ['mobile_money'] : ['card'],
    metadata: opts.metadata ?? {},
  });
  if (!data?.authorization_url) throw new Error('Paystack did not return a payment page. Try again.');
  return data.authorization_url;
}

/** Paystack's names for the Ghana Mobile Money networks */
export const MOMO_PROVIDERS = { mtn: 'mtn', telecel: 'vod', airteltigo: 'atl' } as const;
export type MomoNetwork = keyof typeof MOMO_PROVIDERS;

/** What Paystack says after asking for a Mobile Money prompt. */
export type ChargeResult = {
  /** pay_offline: prompt sent, approve it on the phone. send_otp: type the code Paystack/the network sent. */
  status: 'success' | 'failed' | 'pay_offline' | 'send_otp' | 'pending' | 'ongoing' | string;
  displayText: string;
  gatewayResponse: string;
};

type ChargeData = { status: string; display_text?: string; gateway_response?: string; message?: string };
const asCharge = (d: ChargeData): ChargeResult => ({ status: d.status, displayText: d.display_text ?? d.message ?? '', gatewayResponse: d.gateway_response ?? '' });

/** A refused charge comes back as an error: it's a failed try, with Paystack's reason when it gives one. */
function refused(e: unknown): ChargeResult {
  const err = e as Error & { data?: ChargeData };
  const msg = err.message.replace(/^Paystack:\s*/, '');
  if (/key|reach Paystack|not set up/i.test(msg)) throw e;
  const why = err.data?.gateway_response || err.data?.display_text || msg;
  return { status: 'failed', displayText: why, gatewayResponse: why };
}

/**
 * Sends a Mobile Money prompt to the customer's phone, without leaving the app.
 * Paystack answers right away; the payment itself is confirmed later (verify or webhook).
 */
export async function chargeMomo(opts: {
  email: string;
  amount: number; // GH₵
  reference: string;
  phone: string; // 0241234567
  network: MomoNetwork;
  metadata?: Record<string, unknown>;
}): Promise<ChargeResult> {
  try {
    return asCharge(
      await call<ChargeData>('POST', '/charge', {
        email: opts.email,
        amount: toPesewas(opts.amount),
        currency: 'GHS',
        reference: opts.reference,
        mobile_money: { phone: opts.phone, provider: MOMO_PROVIDERS[opts.network] },
        metadata: opts.metadata ?? {},
      }),
    );
  } catch (e) {
    return refused(e);
  }
}

/** Telecel (and sometimes others) send a code by SMS that has to be typed in. */
export async function submitChargeOtp(reference: string, otp: string): Promise<ChargeResult> {
  try {
    return asCharge(await call<ChargeData>('POST', '/charge/submit_otp', { reference, otp }));
  } catch (e) {
    return refused(e);
  }
}

export type Verified = { status: PaystackStatus; amount: number; currency: string; reference: string; channel: string; gatewayResponse: string };

/** Asks Paystack what happened to a payment. amount is in pesewas. */
export async function verifyPayment(reference: string): Promise<Verified> {
  const d = await call<{ status: PaystackStatus; amount: number; currency: string; reference: string; channel?: string; gateway_response?: string }>(
    'GET',
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  return { status: d.status, amount: Number(d.amount), currency: d.currency, reference: d.reference, channel: d.channel ?? '', gatewayResponse: d.gateway_response ?? '' };
}

/** Gives the money back to the customer (all of it). */
export async function refundPayment(reference: string, reason: string): Promise<void> {
  await call('POST', '/refund', { transaction: reference, merchant_note: reason.slice(0, 200), customer_note: 'Your Relax&Bite order was cancelled.' });
}

/** Paystack signs every webhook with our secret key. Anything without a matching signature is ignored. */
export function webhookIsGenuine(rawBody: string, signature: string | null): boolean {
  const { secret } = config();
  if (!secret || !signature) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Paystack needs an email address; customers sign in with a phone number. Receipts go to our own inbox. */
export function paystackEmail(phone: string, supportEmail: string): string {
  const [user, domain] = supportEmail.split('@');
  return domain ? `${user}+${phone}@${domain}` : `${phone}@customers.invalid`;
}
