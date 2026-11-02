// Notifications on the page, for vendors, riders and admins, and for customers
// (pass as: 'customer' from the customer's Notifications page).
// - In the Android app: the app's own notifications (Firebase), through Capacitor
// - In a browser: Web Push, through a small service worker (public/sw.js)
// Nothing is asked until they tap "Allow notifications"; after that the phone
// shows its own "Allow Relax&Bite to send notifications?" question.

type NativePush = {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  createChannel?(c: { id: string; name: string; description?: string; importance?: number; vibration?: boolean; visibility?: number }): Promise<void>;
  addListener(event: string, cb: (data: any) => void): Promise<unknown> | unknown;
};

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { PushNotifications?: NativePush } };
  }
}

export type PushState = 'on' | 'off' | 'blocked' | 'unsupported' | 'old-app';

function native(): NativePush | null {
  const c = window.Capacitor;
  if (!c?.isNativePlatform?.()) return null;
  return c.Plugins?.PushNotifications ?? null;
}
const inApp = () => document.documentElement.classList.contains('in-app');
const webSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

async function post(url: string, body: object): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Couldn't save. Try again.");
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// ---------- The app ----------
let nativeBound = false;
function bindNative(p: NativePush): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!nativeBound) {
      nativeBound = true;
      // Tapping a notification opens the right page
      p.addListener('pushNotificationActionPerformed', (a: { notification?: { data?: { url?: string } } }) => {
        const url = a?.notification?.data?.url;
        if (url && url.startsWith('/')) window.location.href = url;
      });
    }
    p.addListener('registration', (t: { value: string }) => resolve(t.value));
    p.addListener('registrationError', (e: { error?: string }) => reject(new Error(e?.error || 'registration failed')));
  });
}

async function nativeTurnOn(p: NativePush, ask: boolean, as?: 'customer'): Promise<PushState> {
  let perm = (await p.checkPermissions()).receive;
  if (perm !== 'granted' && ask) perm = (await p.requestPermissions()).receive;
  if (perm === 'denied') return 'blocked';
  if (perm !== 'granted') return 'off';
  await p.createChannel?.({ id: 'orders', name: 'Orders', description: 'Order updates', importance: 5, vibration: true, visibility: 1 }).catch(() => {});
  const got = bindNative(p);
  await p.register();
  const token = await Promise.race([got, new Promise<string>((_, no) => setTimeout(() => no(new Error('timeout')), 15000))]);
  await post('/api/push/subscribe', { as, kind: 'fcm', endpoint: token });
  return 'on';
}

// ---------- Browsers ----------
async function webTurnOn(publicKey: string, ask: boolean, as?: 'customer'): Promise<PushState> {
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') {
    if (!ask) return 'off';
    const answer = await Notification.requestPermission();
    if (answer === 'denied') return 'blocked';
    if (answer !== 'granted') return 'off';
  }
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await post('/api/push/subscribe', { as, kind: 'web', endpoint: json.endpoint, keys: json.keys });
  return 'on';
}

/**
 * ask: true after they tap "Allow notifications" (shows the phone's question).
 * ask: false on page load: only re-saves this device if they already allowed it.
 */
export async function turnOnPush(opts: { webKey: string; appReady: boolean; ask: boolean; as?: 'customer' }): Promise<PushState> {
  const p = native();
  if (p) return opts.appReady ? nativeTurnOn(p, opts.ask, opts.as) : 'unsupported';
  if (inApp()) return 'old-app'; // an app build without notifications
  if (!webSupported() || !opts.webKey) return 'unsupported';
  return webTurnOn(opts.webKey, opts.ask, opts.as);
}

/** What to show before asking anything. */
export async function pushState(opts: { webKey: string; appReady: boolean }): Promise<PushState> {
  const p = native();
  if (p) {
    if (!opts.appReady) return 'unsupported';
    const perm = (await p.checkPermissions()).receive;
    return perm === 'granted' ? 'on' : perm === 'denied' ? 'blocked' : 'off';
  }
  if (inApp()) return 'old-app';
  if (!webSupported() || !opts.webKey) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

export async function turnOffPush(as?: 'customer'): Promise<void> {
  if (native() || !webSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post('/api/push/unsubscribe', { as, endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export async function sendTestPush(as?: 'customer'): Promise<number> {
  const res = await fetch('/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as }) });
  const data = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
  if (!res.ok) throw new Error(data.error || 'Try again.');
  return data.sent ?? 0;
}
