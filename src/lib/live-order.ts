// The order tracker on the phone's lock screen (Android app only).
// The order page hands this to the app, and the app asks /api/orders/CODE/live
// for fresh copies while the order is on its way, even after the page is closed.
import type { Order, OrderStatus, Vendor } from '../data/types';
import { clock } from './format';

export type LiveOrder = {
  code: string;
  status: OrderStatus;
  /** 0 to 100, the bar on the notification */
  progress: number;
  title: string;
  text: string;
  /** Short time for the chip in the status bar, e.g. "6:45pm" */
  chip: string;
  /** Delivered or cancelled: the tracker stops */
  final: boolean;
  /** Where the app asks for updates (same site) */
  api: string;
};

const PROGRESS: Partial<Record<OrderStatus, number>> = {
  placed: 10,
  accepted: 30,
  preparing: 50,
  ready: 65,
  picked_up: 85,
  delivered: 100,
  cancelled: 100,
};

/** When the food should arrive: the kitchen's longest prep time plus the ride. */
export function estimatedArrival(order: Order, vendor?: Pick<Vendor, 'prep_time_max'> | null): string {
  const minutes = (vendor?.prep_time_max ?? 30) + 15;
  return new Date(new Date(order.created_at).getTime() + minutes * 6e4).toISOString();
}

/** null while the order is waiting for payment (nothing to track yet). */
export function liveOrder(order: Order, vendor: Pick<Vendor, 'prep_time_max'> | null | undefined, origin: string): LiveOrder | null {
  if (order.status === 'pending_payment') return null;
  const eta = clock(estimatedArrival(order, vendor));
  const arriving = `Arriving about ${eta}`;
  const place = order.vendor_name;
  const words: Record<Exclude<OrderStatus, 'pending_payment'>, [string, string]> = {
    placed: ['Order placed', `Waiting for ${place} to accept · ${arriving}`],
    accepted: ['Order accepted', `${place} has your order · ${arriving}`],
    preparing: ['Preparing your food', `${place} is cooking · ${arriving}`],
    ready: ['Food is ready', `Waiting for the rider · ${arriving}`],
    picked_up: ['Rider on the way', order.rider_name ? `${order.rider_name} has your food · ${arriving}` : `Your food is on the way · ${arriving}`],
    delivered: ['Delivered', 'Enjoy your meal!'],
    cancelled: ['Order cancelled', `${order.code} was cancelled`],
  };
  const [title, text] = words[order.status];
  const final = order.status === 'delivered' || order.status === 'cancelled';
  return {
    code: order.code,
    status: order.status,
    progress: PROGRESS[order.status] ?? 0,
    title,
    text,
    chip: final ? '' : eta.replace(' ', ''),
    final,
    api: `${origin}/api/orders/${encodeURIComponent(order.code)}/live`,
  };
}
