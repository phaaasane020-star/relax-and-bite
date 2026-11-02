// Which phones and browsers allowed notifications, and sending to them.
// A device belongs to a vendor/rider/admin account OR to a customer.
// Never holds up an order: problems are only logged.

import { sql, sqlOne } from '../lib/supabase';
import { fcmReady, sendAppPush, sendWebPush, webPushReady, type PushMessage } from '../lib/webpush';

type Sub = { id: number; kind: 'web' | 'fcm'; endpoint: string; p256dh: string | null; auth: string | null };
/** Who the device belongs to */
export type PushOwner = { account: string } | { customer: string };

const ownerCols = (o: PushOwner) => ('account' in o ? { account: o.account, customer: null } : { account: null, customer: o.customer });

export function pushReady(): { web: boolean; app: boolean } {
  return { web: webPushReady(), app: fcmReady() };
}

/** Saves this phone/browser for its owner (or moves it over if someone else used it before). */
export async function savePushSubscription(
  owner: PushOwner,
  sub: { kind: 'web' | 'fcm'; endpoint: string; p256dh?: string; auth?: string; device?: string },
): Promise<void> {
  const endpoint = sub.endpoint.trim();
  if (sub.kind === 'web') {
    if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint)) throw new Error('bad endpoint');
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(sub.p256dh ?? '') || !/^[A-Za-z0-9_-]{16,30}$/.test(sub.auth ?? '')) throw new Error('bad keys');
  } else if (!/^[A-Za-z0-9_:\-]{20,400}$/.test(endpoint)) throw new Error('bad token');
  const { account, customer } = ownerCols(owner);
  await sql(
    `insert into push_subscriptions (account_id, customer_id, kind, endpoint, p256dh, auth, device)
     values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
     on conflict (endpoint) do update set account_id = excluded.account_id, customer_id = excluded.customer_id,
       p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, kind = excluded.kind
     returning id`,
    [account, customer, sub.kind, endpoint, sub.p256dh ?? null, sub.auth ?? null, (sub.device ?? '').slice(0, 120)],
  );
}

export async function removePushSubscription(owner: PushOwner, endpoint: string): Promise<void> {
  const { account, customer } = ownerCols(owner);
  await sql(
    'delete from push_subscriptions where endpoint = $3 and (account_id = $1::uuid or customer_id = $2::uuid) returning id',
    [account, customer, endpoint],
  );
}

export async function pushCount(accountId: string): Promise<number> {
  const rows = await sql<{ n: number }>('select count(*)::int as n from push_subscriptions where account_id = $1::uuid', [accountId]);
  return rows[0]?.n ?? 0;
}

async function sendToSubs(subs: Sub[], msg: PushMessage): Promise<number> {
  const results = await Promise.all(
    subs.map(async (s) => {
      const r = s.kind === 'web' ? (s.p256dh && s.auth ? await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, msg) : 'gone') : await sendAppPush(s.endpoint, msg);
      return { s, r };
    }),
  );
  const gone = results.filter((x) => x.r === 'gone').map((x) => x.s.id);
  if (gone.length) await sql('delete from push_subscriptions where id in (select (jsonb_array_elements_text($1::jsonb))::bigint) returning id', [gone]);
  const sent = results.filter((x) => x.r === 'sent').map((x) => x.s.id);
  if (sent.length) await sql('update push_subscriptions set last_used_at = now() where id in (select (jsonb_array_elements_text($1::jsonb))::bigint) returning id', [sent]);
  return sent.length;
}

function notSetUp(msg: PushMessage): boolean {
  const ready = pushReady();
  if (ready.web || ready.app) return false;
  console.log(`[push] (not sent: notifications not set up in .env) ${msg.title}`);
  return true;
}

/** Sends to every phone/browser of these partner accounts. Returns how many got it. */
export async function pushToAccounts(accountIds: string[], msg: PushMessage): Promise<number> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (!ids.length || notSetUp(msg)) return 0;
  const subs = await sql<Sub>(
    `select id, kind, endpoint, p256dh, auth from push_subscriptions
     where account_id in (select (jsonb_array_elements_text($1::jsonb))::uuid) limit 200`,
    [ids],
  );
  return sendToSubs(subs, msg);
}

/**
 * Sends to a customer's phones/browsers, if they want this kind of update
 * ('orders' or 'rider'; 'test' and 'support' replies always go). Returns how many got it.
 */
export async function pushToCustomer(customerId: string, topic: 'orders' | 'rider' | 'test' | 'support', msg: PushMessage): Promise<number> {
  if (!customerId || notSetUp(msg)) return 0;
  const subs = await sql<Sub>(
    `select s.id, s.kind, s.endpoint, s.p256dh, s.auth from push_subscriptions s join customer_users c on c.id = s.customer_id
     where s.customer_id = $1::uuid
       and case $2 when 'orders' then c.notify_orders when 'rider' then c.notify_rider else true end
     limit 20`,
    [customerId, topic],
  );
  return sendToSubs(subs, msg);
}

/** A customer's switches on their Notifications page. */
export type CustomerNotifyPrefs = { orders: boolean; rider: boolean };

export async function getCustomerNotifyPrefs(customerId: string): Promise<CustomerNotifyPrefs> {
  const row = await sqlOne<{ notify_orders: boolean; notify_rider: boolean }>('select notify_orders, notify_rider from customer_users where id = $1::uuid', [customerId]);
  return { orders: row?.notify_orders ?? true, rider: row?.notify_rider ?? true };
}

export async function setCustomerNotifyPref(customerId: string, topic: 'orders' | 'rider', on: boolean): Promise<void> {
  const col = topic === 'orders' ? 'notify_orders' : 'notify_rider';
  await sql(`update customer_users set ${col} = $2::boolean where id = $1::uuid returning id`, [customerId, on]);
}

/** Gives up after a few seconds so a slow send never holds anything up. */
async function quietly(p: Promise<unknown>): Promise<void> {
  try {
    await Promise.race([p, new Promise((done) => setTimeout(done, 6000))]);
  } catch (e) {
    console.error('[push] skipped:', (e as Error).message);
  }
}

export async function pushQuietly(accountIds: string[], msg: PushMessage): Promise<void> {
  await quietly(pushToAccounts(accountIds, msg));
}

export async function pushCustomerQuietly(customerId: string | null | undefined, topic: 'orders' | 'rider' | 'support', msg: PushMessage): Promise<void> {
  if (customerId) await quietly(pushToCustomer(customerId, topic, msg));
}
