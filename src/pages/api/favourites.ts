import type { APIRoute } from 'astro';
import { json } from '../../lib/http';
import { getItemsByIds, getVendorById, vendorStatusLabel } from '../../data/store';

// Details for the restaurants and dishes saved on this device.
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { vendors?: string[]; items?: string[] };
  const vendorIds = (body.vendors ?? []).slice(0, 100).map(String);
  const itemIds = new Set((body.items ?? []).slice(0, 200).map(String));

  const vendors = [];
  for (const id of vendorIds) {
    const v = await getVendorById(id);
    if (!v || v.status !== 'approved') continue;
    vendors.push({
      id: v.id,
      slug: v.slug,
      name: v.name,
      cuisines: v.cuisine_tags.join(', '),
      cover_url: v.cover_url,
      is_open: v.is_open,
      status: vendorStatusLabel(v),
    });
  }

  // Dishes: look them up through their restaurants
  const items = [];
  if (itemIds.size) {
    const found = await getItemsByIds([...itemIds]);
    const vendorOpen = new Map<string, boolean>();
    for (const item of found) {
      if (!vendorOpen.has(item.vendor_id)) vendorOpen.set(item.vendor_id, (await getVendorById(item.vendor_id))?.is_open ?? false);
      items.push({
        id: item.id,
        name: item.name,
        price: item.price,
        image_url: item.image_url,
        is_available: item.is_available,
        vendor_name: item.vendor_name,
        vendor_slug: item.vendor_slug,
        vendor_open: vendorOpen.get(item.vendor_id) ?? false,
      });
    }
  }
  return json({ vendors, items });
};
