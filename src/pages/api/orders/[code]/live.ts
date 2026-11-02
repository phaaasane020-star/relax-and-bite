import type { APIRoute } from 'astro';
import { json } from '../../../../lib/http';
import { getOrderByCode, getVendorById } from '../../../../data/store';
import { ownsOrder } from '../../../../lib/session';
import { liveOrder } from '../../../../lib/live-order';

// Fresh tracker details for the app's lock-screen notification (owner only).
export const GET: APIRoute = async ({ params, cookies, url }) => {
  const order = await getOrderByCode(params.code ?? '');
  if (!order || !ownsOrder(cookies, order)) return json({ error: 'Not found' }, 404);
  const live = liveOrder(order, await getVendorById(order.vendor_id), url.origin);
  return json(live ?? { code: order.code, waiting: true }, live ? 200 : 202);
};
