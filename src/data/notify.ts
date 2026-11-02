// Order alerts for vendors, riders and admins: phone/computer notifications
// (for those who allowed them, see data/push.ts) and email (lib/email.ts).
// - New order (placed, or paid if online): the restaurant, and online riders in that town
// - Order ready: the rider who took it, or online riders in town if nobody has yet
// Alerts never hold up or break an order: if email isn't set up or fails, it's only logged.

import { sql } from '../lib/supabase';
import { brandedHtml, sendQuietly, type Email } from '../lib/email';
import { pushCustomerQuietly, pushQuietly } from './push';
import { serverEnv } from '../lib/env';
import type { Order } from './types';

const cedis = (n: number) => `GH₵${Number(n).toFixed(2)}`;

function site(): string {
  return (serverEnv().PUBLIC_SITE_URL || '').replace(/\/+$/, '');
}
function link(path: string): string | undefined {
  const base = site();
  return base ? `${base}${path}` : undefined;
}

type Who = { account_id: string; email: string | null };

async function vendorOwner(vendorId: string): Promise<Who[]> {
  return sql<Who>(
    `select a.id as account_id, a.email from vendors v join partner_accounts a on a.id = v.owner_account_id
     where v.id = $1::uuid and a.status = 'approved'`,
    [vendorId],
  );
}

async function onlineRiders(zoneId: number): Promise<Who[]> {
  return sql<Who>(
    `select a.id as account_id, a.email from riders r join partner_accounts a on a.id = r.account_id
     where r.zone_id = $1::bigint and r.is_online and a.status = 'approved' limit 50`,
    [zoneId],
  );
}

async function riderById(riderId: string): Promise<Who[]> {
  return sql<Who>(`select a.id as account_id, a.email from riders r join partner_accounts a on a.id = r.account_id where r.id = $1::uuid`, [riderId]);
}

async function admins(): Promise<Who[]> {
  return sql<Who>(`select id as account_id, email from partner_accounts where role = 'admin' and status = 'approved' limit 30`);
}

const emails = (list: Who[]) => list.map((w) => w.email).filter((e): e is string => Boolean(e));
const ids = (list: Who[]) => list.map((w) => w.account_id);

function itemsLine(o: Order): string {
  return (o.items ?? []).map((i) => `${i.quantity} × ${i.name}`).join(', ');
}

function mail(to: string, subject: string, heading: string, lines: string[], button?: { label: string; path: string }): Email {
  const url = button ? link(button.path) : undefined;
  return {
    to,
    subject,
    text: [heading, ...lines, url ? `Open: ${url}` : ''].filter(Boolean).join('\n'),
    html: brandedHtml({ heading, lines, button: url && button ? { label: button.label, url } : undefined, footer: "You get these because you're a Relax&Bite partner. Change your email in Account settings." }),
  };
}

/** A new order the kitchen should start on. */
export async function notifyNewOrder(o: Order): Promise<void> {
  try {
    const [vendor, riders, staff] = await Promise.all([vendorOwner(o.vendor_id), onlineRiders(o.zone_id), admins()]);
    const where = [o.delivery_landmark, o.locality_name || o.zone_name].filter(Boolean).join(', ');
    const pay = o.payment_method === 'cash' ? `Cash on delivery: ${cedis(o.total)}` : `Paid online: ${cedis(o.total)}`;
    const mails: Email[] = [
      ...emails(vendor).map((to) =>
        mail(to, `New order ${o.code}: ${cedis(o.subtotal)}`, `New order ${o.code}`, [itemsLine(o), pay, o.note ? `Note: ${o.note}` : '', 'Accept it in your Relax&Bite kitchen.'].filter(Boolean), { label: 'Open orders', path: '/vendor' }),
      ),
      ...emails(riders).map((to) =>
        mail(to, `Delivery available: ${o.vendor_name}`, `A delivery is coming up`, [`${o.vendor_name} has a new order (${o.code}) going to ${where || o.zone_name}.`, `Delivery fee: ${cedis(o.delivery_fee)}`, 'Take it in the rider app before someone else does.'], { label: 'See deliveries', path: '/rider' }),
      ),
    ];
    await Promise.all([
      sendQuietly(mails, `new order ${o.code}`),
      pushQuietly(ids(vendor), { title: `New order ${o.code}`, body: `${itemsLine(o)} · ${cedis(o.subtotal)}`, url: '/vendor', tag: o.code }),
      pushQuietly(ids(riders), { title: 'Delivery available', body: `${o.vendor_name} → ${where || o.zone_name} · fee ${cedis(o.delivery_fee)}`, url: '/rider', tag: `${o.code}-ride` }),
      pushQuietly(ids(staff), { title: `New order ${o.code}`, body: `${o.vendor_name} · ${o.zone_name} · ${cedis(o.total)}`, url: '/admin/orders', tag: o.code }),
    ]);
  } catch (e) {
    console.error(`[notify] new order ${o.code}: alerts skipped:`, (e as Error).message);
  }
}

/** The food is ready for pickup. */
export async function notifyOrderReady(o: Order): Promise<void> {
  try {
    const assigned = o.rider_id ? await riderById(o.rider_id) : [];
    const to = assigned.length ? assigned : await onlineRiders(o.zone_id);
    const lines = assigned.length
      ? [`${o.vendor_name} has ${o.code} ready.`, `Pick up at: ${o.vendor_address || o.vendor_name}`]
      : [`${o.vendor_name} has ${o.code} ready and no rider has taken it yet.`, `Delivery fee: ${cedis(o.delivery_fee)}`];
    await Promise.all([
      sendQuietly(
        emails(to).map((t) => mail(t, `Ready for pickup: ${o.code}`, 'Order ready for pickup', lines, { label: assigned.length ? 'Open delivery' : 'See deliveries', path: '/rider' })),
        `ready ${o.code}`,
      ),
      pushQuietly(ids(to), { title: `Ready for pickup: ${o.code}`, body: lines.join(' '), url: '/rider', tag: `${o.code}-ready` }),
    ]);
  } catch (e) {
    console.error(`[notify] ready ${o.code}: alerts skipped:`, (e as Error).message);
  }
}

/** Someone applied to sell or ride: the admins should review it. */
export async function notifyNewApplication(kind: 'vendor' | 'rider', name: string): Promise<void> {
  try {
    const staff = await admins();
    await pushQuietly(ids(staff), {
      title: kind === 'vendor' ? 'New restaurant application' : 'New rider application',
      body: `${name} is waiting for approval.`,
      url: '/admin/applications',
      tag: `apply-${name}`,
    });
  } catch (e) {
    console.error('[notify] application alert skipped:', (e as Error).message);
  }
}

// =====================================================================
// Customers: order and rider updates on their phone (if they allowed them)
// =====================================================================
export type CustomerEvent = 'accepted' | 'declined' | 'cancelled' | 'ready' | 'rider_assigned' | 'picked_up' | 'delivered';

/** One short notification to the customer about their order. */
export async function notifyCustomer(o: Order, event: CustomerEvent): Promise<void> {
  if (!o.customer_id) return;
  try {
    const rider = o.rider_name?.split(' ')[0] || 'Your rider';
    const online = o.payment_method !== 'cash' && o.payment_status !== 'unpaid';
    const m: Record<CustomerEvent, { topic: 'orders' | 'rider'; title: string; body: string }> = {
      accepted: { topic: 'orders', title: 'Order accepted', body: `${o.vendor_name} is preparing your food.` },
      declined: {
        topic: 'orders',
        title: `${o.vendor_name} couldn't take your order`,
        body: `${o.cancel_reason || 'The restaurant declined it.'}${online ? ' Your money is being refunded.' : ''}`,
      },
      cancelled: { topic: 'orders', title: 'Your order was cancelled', body: `${o.cancel_reason || 'Contact us if you have questions.'}${online ? ' Your money is being refunded.' : ''}` },
      ready: { topic: 'orders', title: 'Your food is ready', body: o.rider_id ? `${rider} will pick it up soon.` : 'A rider will pick it up soon.' },
      rider_assigned: { topic: 'rider', title: `${rider} is collecting your order`, body: `From ${o.vendor_name}. We'll tell you when it's on the way.` },
      picked_up: { topic: 'rider', title: 'Your order is on the way', body: `${rider} has your food. Have your 4-digit delivery code ready.` },
      delivered: { topic: 'orders', title: 'Delivered. Enjoy your meal!', body: `Tap to rate ${o.vendor_name}.` },
    };
    const n = m[event];
    await pushCustomerQuietly(o.customer_id, n.topic, { title: n.title, body: n.body, url: `/orders/${o.code}`, tag: `${o.code}-me` });
  } catch (e) {
    console.error(`[notify] customer ${o.code} ${event}: skipped:`, (e as Error).message);
  }
}

// =====================================================================
// Wallet withdrawals
// =====================================================================
/** A vendor or rider asked to withdraw: the admins should send it. */
export async function notifyWithdrawalRequested(name: string, payout: number): Promise<void> {
  try {
    const staff = await admins();
    await pushQuietly(ids(staff), { title: 'Withdrawal to send', body: `${name}: ${cedis(payout)} to their MoMo.`, url: '/admin/payouts', tag: `payout-${name}` });
  } catch (e) {
    console.error('[notify] withdrawal alert skipped:', (e as Error).message);
  }
}

/** Sent or rejected: tell the person who asked. */
export async function notifyWithdrawalDecided(accountId: string, role: 'vendor' | 'rider', paid: boolean, payout: number, note: string): Promise<void> {
  await pushQuietly([accountId], {
    title: paid ? 'Money sent to your MoMo' : 'Withdrawal not sent',
    body: paid ? `${cedis(payout)} is on its way to your Mobile Money.` : `${note} The amount is back in your wallet.`,
    url: role === 'vendor' ? '/vendor/wallet' : '/rider/wallet',
    tag: 'payout',
  });
}
