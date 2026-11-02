import type { APIRoute } from 'astro';
import { json } from '../../lib/http';
import { getZone, tidyArea, validLocality } from '../../data/store';
import { getLocation, setLocation } from '../../lib/session';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => ({}))) as { zoneId?: number; localityId?: number | null; area?: string; landmark?: string };
  const zone = await getZone(Number(body.zoneId));
  if (!zone || !zone.is_active) return json({ error: 'Choose your town.' }, 400);
  let localityId: number | null;
  try {
    localityId = await validLocality(zone.id, Number(body.localityId) || null);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  // "Not listed" (0) needs the name of their area
  const area = localityId ? '' : tidyArea(body.area);
  if (Number(body.localityId) === 0 && body.localityId !== null && !area) return json({ error: 'Type the name of your area.' }, 400);

  const previous = getLocation(cookies);
  setLocation(cookies, {
    zoneId: zone.id,
    localityId,
    area,
    landmark: String(body.landmark ?? '').trim().slice(0, 120),
    details: previous?.details ?? '',
  });
  return json({ ok: true });
};
