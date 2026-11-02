// Server-only: sends notifications to browsers (Web Push, the standard every
// modern browser uses) and to the Android app (Firebase Cloud Messaging).
// No extra packages: the encryption and signing use Node's own crypto.
//
// .env:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   from  node scripts/vapid-keys.mjs
//   FCM_SERVICE_ACCOUNT                     the Firebase service-account JSON, on one line

import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';
import { serverEnv } from './env';

export type PushMessage = { title: string; body: string; url: string; tag?: string };
/** 'gone': this phone/browser turned notifications off or was reset; forget it */
export type PushResult = 'sent' | 'gone' | 'failed';

const b64url = (buf: Buffer) => buf.toString('base64url');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// ---------- Web Push (browsers) ----------

export function webPushReady(): boolean {
  const v = serverEnv();
  return Boolean(v.VAPID_PUBLIC_KEY && v.VAPID_PRIVATE_KEY);
}

/** The public key browsers need to subscribe (safe to show). */
export function vapidPublicKey(): string {
  return serverEnv().VAPID_PUBLIC_KEY.trim();
}

function vapidHeader(endpoint: string): string {
  const v = serverEnv();
  const pub = fromB64url(v.VAPID_PUBLIC_KEY.trim());
  const key = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: v.VAPID_PRIVATE_KEY.trim(), x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const site = (v.PUBLIC_SITE_URL || '').trim();
  const head = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: site.startsWith('https://') ? site : 'mailto:support@relaxandbite.app',
      }),
    ),
  );
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64url(sig)}, k=${v.VAPID_PUBLIC_KEY.trim()}`;
}

/** Encrypts the message for one browser (RFC 8291, "aes128gcm"). */
export function encryptForBrowser(payload: Buffer, p256dh: string, auth: string): Buffer {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const ecdh = createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const salt = randomBytes(16);
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export async function sendWebPush(sub: { endpoint: string; p256dh: string; auth: string }, msg: PushMessage): Promise<PushResult> {
  if (!webPushReady()) return 'failed';
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(sub.endpoint),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '3600',
        Urgency: 'high',
      },
      body: new Uint8Array(encryptForBrowser(Buffer.from(JSON.stringify(msg)), sub.p256dh, sub.auth)),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    if (!res.ok) {
      console.error(`[push] browser push refused (HTTP ${res.status}):`, (await res.text().catch(() => '')).slice(0, 300));
      return 'failed';
    }
    return 'sent';
  } catch (e) {
    console.error('[push] browser push failed:', (e as Error).message);
    return 'failed';
  }
}

// ---------- Firebase (the Android app) ----------

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };

function serviceAccount(): ServiceAccount | null {
  const raw = serverEnv().FCM_SERVICE_ACCOUNT.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(json) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    console.error('[push] FCM_SERVICE_ACCOUNT in .env is not valid JSON');
    return null;
  }
}

export function fcmReady(): boolean {
  return serviceAccount() !== null;
}

let token: { value: string; until: number } | null = null;
let signingIn: Promise<string | null> | null = null;

/** One Firebase sign-in shared by all the notifications going out at the same moment. */
function fcmAccessToken(sa: ServiceAccount): Promise<string | null> {
  if (token && token.until > Date.now() + 60_000) return Promise.resolve(token.value);
  signingIn ??= fetchAccessToken(sa).finally(() => (signingIn = null));
  return signingIn;
}

async function fetchAccessToken(sa: ServiceAccount): Promise<string | null> {
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(
    Buffer.from(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat: now, exp: now + 3600 })),
  );
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), sa.private_key.replace(/\\n/g, '\n'));
  try {
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(sig)}` }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !data.access_token) {
      console.error(`[push] Firebase sign-in refused (HTTP ${res.status}). Check FCM_SERVICE_ACCOUNT.`);
      return null;
    }
    token = { value: data.access_token, until: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return token.value;
  } catch (e) {
    console.error('[push] Firebase could not be reached:', (e as Error).message);
    return null;
  }
}

export async function sendAppPush(deviceToken: string, msg: PushMessage): Promise<PushResult> {
  const sa = serviceAccount();
  if (!sa) return 'failed';
  const access = await fcmAccessToken(sa);
  if (!access) return 'failed';
  const base = (serverEnv().FCM_API_URL || 'https://fcm.googleapis.com').replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: msg.title, body: msg.body },
          data: { url: msg.url },
          android: { priority: 'HIGH', notification: { sound: 'default', tag: msg.tag, channel_id: 'orders' } },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return 'sent';
    const text = await res.text().catch(() => '');
    if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)) return 'gone';
    if (res.status === 401) token = null;
    console.error(`[push] Firebase refused the notification (HTTP ${res.status}):`, text.slice(0, 300));
    return 'failed';
  } catch (e) {
    console.error('[push] Firebase send failed:', (e as Error).message);
    return 'failed';
  }
}
