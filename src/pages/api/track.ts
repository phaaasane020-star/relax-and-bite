import type { APIRoute } from 'astro';
import { json } from '../../lib/http';
import { recordAddToCart, recordItemView } from '../../data/insights';

// Light-weight events from the menu page: a dish opened, or something added to cart.
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { vendorId?: string; itemId?: string; event?: string };
  const vendorId = String(body.vendorId ?? '');
  if (body.event === 'item_view' && body.itemId) await recordItemView(vendorId, String(body.itemId));
  if (body.event === 'add_to_cart') await recordAddToCart(vendorId);
  return json({ ok: true });
};
