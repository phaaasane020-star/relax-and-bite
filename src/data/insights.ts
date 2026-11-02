// Numbers for the vendor "Sales and visits" page and the rider "Earnings" page.
// Orders and visit counts come from Supabase; the sums are worked out here.
import { sql } from '../lib/supabase';
import { isUuid } from '../lib/ids';
import { SITE, commissionFor, freeUntil } from './site';
import { VENDOR_COLS } from './store';
import type { MenuItem, Order, TrafficDay, Vendor } from './types';

export type Range = 'today' | '7d' | '30d';
export const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

export function parseRange(v: string | null): Range {
  return v === 'today' || v === '30d' ? v : '7d';
}

const DAY = 864e5;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const span = (r: Range) => (r === 'today' ? 1 : r === '7d' ? 7 : 30);

/** Day keys for the range, oldest first, ending today. offset=1 gives the period before. */
function days(range: Range, offset = 0): string[] {
  const n = span(range);
  const end = Date.now() - offset * n * DAY;
  return Array.from({ length: n }, (_, i) => dayKey(end - (n - 1 - i) * DAY));
}

const shortDay = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
const minutesBetween = (a?: string, b?: string) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 6e4 : null);
const eventAt = (o: Order, s: Order['status']) => o.events.find((e) => e.status === s)?.at;
const average = (list: number[]) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);

/** Percentage change vs the previous period, or null if there's nothing to compare with. */
function change(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

// =====================================================================
// Tracking (called from the storefront). Counting is done in the database
// so two visits at the same moment are both counted.
// =====================================================================
export async function recordVisit(vendorId: string, visitorId: string): Promise<void> {
  if (!isUuid(vendorId) || !visitorId) return;
  await sql('select record_store_visit($1::uuid, $2) as ok', [vendorId, visitorId.slice(0, 64)]);
}

export async function recordItemView(vendorId: string, itemId: string): Promise<void> {
  if (!isUuid(vendorId) || !isUuid(itemId)) return;
  await sql(
    `select record_item_view($1::uuid, $2::uuid) as ok where exists (select 1 from menu_items where id = $2::uuid and vendor_id = $1::uuid)`,
    [vendorId, itemId],
  );
}

export async function recordAddToCart(vendorId: string): Promise<void> {
  if (!isUuid(vendorId)) return;
  await sql('select record_add_to_cart($1::uuid) as ok where exists (select 1 from vendors where id = $1::uuid)', [vendorId]);
}

/** Orders and visits for one store, from the start of the earlier comparison period. */
async function loadVendorData(vendorId: string, range: Range) {
  const back = span(range) * 2;
  const ORDER_COLS = `o.id, o.code, o.status, o.subtotal, o.commission_rate, o.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('menu_item_id', i.menu_item_id, 'name', i.name, 'quantity', i.quantity, 'line_total', i.line_total))
      from order_items i where i.order_id = o.id), '[]'::jsonb) as items,
    coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'at', e.at) order by e.at, e.id) from order_events e where e.order_id = o.id), '[]'::jsonb) as events`;
  const [orders, trafficRows, items, vendors] = await Promise.all([
    // Only orders the kitchen received (not ones that were never paid for)
    sql<Order>(`select ${ORDER_COLS} from orders o where o.vendor_id = $1::uuid and o.created_at >= current_date - $2::int + 1 and (o.payment_method = 'cash' or o.payment_status in ('paid', 'refunded'))`, [vendorId, back]),
    sql<{ day: string; views: number; unique_visitors: number; add_to_cart: number; item_views: Record<string, number> }>(
      'select day, views, unique_visitors, add_to_cart, item_views from store_traffic where vendor_id = $1::uuid and day >= current_date - $2::int + 1',
      [vendorId, back],
    ),
    sql<Pick<MenuItem, 'id' | 'name'>>('select id, name from menu_items where vendor_id = $1::uuid', [vendorId]),
    sql<Vendor>(`select ${VENDOR_COLS} from vendors v where v.id = $1::uuid`, [vendorId]),
  ]);
  const traffic = new Map<string, TrafficDay>();
  for (const t of trafficRows) {
    traffic.set(String(t.day).slice(0, 10), { views: t.views, unique: t.unique_visitors, add_to_cart: t.add_to_cart, item_views: t.item_views ?? {} });
  }
  return { orders, traffic, items, vendor: vendors[0] as Vendor | undefined };
}

// =====================================================================
// Vendor
// =====================================================================
export type Bar = { label: string; value: number; tip: string };

export async function vendorInsights(vendorId: string, range: Range) {
  const keys = days(range);
  const prevKeys = days(range, 1);
  const inKeys = (o: Order, list: string[]) => list.includes(o.created_at.slice(0, 10));
  const data = isUuid(vendorId)
    ? await loadVendorData(vendorId, range)
    : { orders: [] as Order[], traffic: new Map<string, TrafficDay>(), items: [] as Pick<MenuItem, 'id' | 'name'>[], vendor: undefined };
  const mine = data.orders;

  const summarise = (list: string[]) => {
    const orders = mine.filter((o) => inKeys(o, list));
    const good = orders.filter((o) => o.status !== 'cancelled');
    const traffic = list.map((k) => data.traffic.get(k)).filter((t): t is TrafficDay => !!t);
    return {
      orders,
      good,
      sales: good.reduce((s, o) => s + o.subtotal, 0),
      // Each order keeps the fee rate it was placed with (0 in the free first month)
      fee: good.reduce((s, o) => s + Math.round(o.subtotal * Number(o.commission_rate ?? SITE.commissionRate) * 100) / 100, 0),
      freeOrders: good.filter((o) => Number(o.commission_rate ?? SITE.commissionRate) === 0).length,
      cancelled: orders.length - good.length,
      views: traffic.reduce((s, t) => s + t.views, 0),
      visitors: traffic.reduce((s, t) => s + t.unique, 0),
      addToCart: traffic.reduce((s, t) => s + t.add_to_cart, 0),
      traffic,
    };
  };

  const now = summarise(keys);
  const before = summarise(prevKeys);
  // Relax&Bite's share now comes off when the restaurant withdraws: shown here at today's rate
  const fee = Math.round(now.sales * commissionFor(data.vendor?.approved_at) * 100) / 100;

  // Sales chart: by hour for today, by day otherwise
  let salesChart: Bar[];
  if (range === 'today') {
    salesChart = Array.from({ length: 17 }, (_, i) => i + 6).map((h) => {
      const v = now.good.filter((o) => new Date(o.created_at).getUTCHours() === h).reduce((s, o) => s + o.subtotal, 0);
      return { label: hourLabel(h), value: v, tip: `${hourLabel(h)}: GH₵ ${v.toFixed(2)}` };
    });
  } else {
    salesChart = keys.map((k) => {
      const list = now.good.filter((o) => o.created_at.slice(0, 10) === k);
      const v = list.reduce((s, o) => s + o.subtotal, 0);
      return { label: shortDay(k), value: v, tip: `${shortDay(k)}: GH₵ ${v.toFixed(2)}, ${list.length} ${list.length === 1 ? 'order' : 'orders'}` };
    });
  }

  // Busiest hours (orders placed)
  const hours: Bar[] = Array.from({ length: 17 }, (_, i) => i + 6).map((h) => {
    const c = now.good.filter((o) => new Date(o.created_at).getUTCHours() === h).length;
    return { label: hourLabel(h), value: c, tip: `${hourLabel(h)}: ${c} ${c === 1 ? 'order' : 'orders'}` };
  });

  // Dishes
  const views: Record<string, number> = {};
  for (const t of now.traffic) for (const [id, n] of Object.entries(t.item_views)) views[id] = (views[id] ?? 0) + n;
  const dishMap = new Map<string, { name: string; qty: number; revenue: number; views: number }>();
  for (const o of now.good) {
    for (const i of o.items) {
      const d = dishMap.get(i.menu_item_id) ?? { name: i.name, qty: 0, revenue: 0, views: 0 };
      d.qty += i.quantity;
      d.revenue += i.line_total;
      dishMap.set(i.menu_item_id, d);
    }
  }
  for (const item of data.items) {
    const d = dishMap.get(item.id) ?? { name: item.name, qty: 0, revenue: 0, views: 0 };
    d.views = views[item.id] ?? 0;
    dishMap.set(item.id, d);
  }
  const dishes = [...dishMap.values()].sort((a, b) => b.revenue - a.revenue || b.views - a.views);

  const prepTimes = now.good.map((o) => minutesBetween(eventAt(o, 'accepted'), eventAt(o, 'ready'))).filter((x): x is number => x !== null);
  const vendor = data.vendor;

  return {
    sales: now.sales,
    salesChange: change(now.sales, before.sales),
    orders: now.good.length,
    ordersChange: change(now.good.length, before.good.length),
    averageOrder: now.good.length ? now.sales / now.good.length : 0,
    cancelled: now.cancelled,
    views: now.views,
    visitors: now.visitors,
    visitorsChange: change(now.visitors, before.visitors),
    addToCart: now.addToCart,
    conversion: now.visitors ? Math.round((now.good.length / now.visitors) * 1000) / 10 : null,
    fee,
    payout: now.sales - fee,
    payoutChange: change(now.sales, before.sales),
    freeOrders: now.freeOrders,
    freeUntil: freeUntil(vendor?.approved_at),
    avgPrep: average(prepTimes),
    rating: vendor?.rating ?? 0,
    ratingCount: vendor?.rating_count ?? 0,
    salesChart,
    hours,
    dishes,
    compareLabel: range === 'today' ? 'yesterday' : range === '7d' ? 'the 7 days before' : 'the 30 days before',
  };
}

// =====================================================================
// Rider
// =====================================================================
export async function riderInsights(riderId: string, range: Range) {
  const keys = days(range);
  const prevKeys = days(range, 1);
  const delivered = isUuid(riderId)
    ? await sql<Order>(
        `select o.id, o.code, o.vendor_name, o.zone_name, o.locality_name, o.delivery_fee, o.total, o.payment_method, o.status, o.created_at,
           coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'at', e.at) order by e.at, e.id) from order_events e where e.order_id = o.id), '[]'::jsonb) as events
         from orders o where o.rider_id = $1::uuid and o.status = 'delivered' and o.created_at >= current_date - $2::int`,
        [riderId, span(range) * 2 + 1],
      )
    : [];
  const deliveredOn = (o: Order) => (eventAt(o, 'delivered') ?? o.created_at).slice(0, 10);

  const now = delivered.filter((o) => keys.includes(deliveredOn(o)));
  const before = delivered.filter((o) => prevKeys.includes(deliveredOn(o)));
  const earnings = now.reduce((s, o) => s + o.delivery_fee, 0);
  const earningsBefore = before.reduce((s, o) => s + o.delivery_fee, 0);
  const cash = now.filter((o) => o.payment_method === 'cash').reduce((s, o) => s + o.total, 0);
  const rideTimes = now.map((o) => minutesBetween(eventAt(o, 'picked_up'), eventAt(o, 'delivered'))).filter((x): x is number => x !== null);

  let chart: Bar[];
  if (range === 'today') {
    chart = Array.from({ length: 17 }, (_, i) => i + 6).map((h) => {
      const list = now.filter((o) => new Date(eventAt(o, 'delivered') ?? o.created_at).getUTCHours() === h);
      const v = list.reduce((s, o) => s + o.delivery_fee, 0);
      return { label: hourLabel(h), value: v, tip: `${hourLabel(h)}: GH₵ ${v.toFixed(2)}, ${list.length} ${list.length === 1 ? 'delivery' : 'deliveries'}` };
    });
  } else {
    chart = keys.map((k) => {
      const list = now.filter((o) => deliveredOn(o) === k);
      const v = list.reduce((s, o) => s + o.delivery_fee, 0);
      return { label: shortDay(k), value: v, tip: `${shortDay(k)}: GH₵ ${v.toFixed(2)}, ${list.length} ${list.length === 1 ? 'delivery' : 'deliveries'}` };
    });
  }

  return {
    earnings,
    earningsChange: change(earnings, earningsBefore),
    deliveries: now.length,
    deliveriesChange: change(now.length, before.length),
    cashCollected: cash,
    avgRide: average(rideTimes),
    chart,
    list: [...now].sort((a, b) => (eventAt(b, 'delivered') ?? '').localeCompare(eventAt(a, 'delivered') ?? '')),
    compareLabel: range === 'today' ? 'yesterday' : range === '7d' ? 'the 7 days before' : 'the 30 days before',
  };
}
