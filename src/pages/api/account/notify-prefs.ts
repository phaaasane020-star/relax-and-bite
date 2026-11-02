// A customer flips "Order updates" or "Rider updates" on their Notifications page.
import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { getUser } from '../../../lib/session';
import { setCustomerNotifyPref } from '../../../data/push';

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getUser(cookies);
  if (!user) return json({ error: 'Sign in again.' }, 401);
  const body = (await request.json().catch(() => ({}))) as { topic?: string; on?: boolean };
  if (body.topic !== 'orders' && body.topic !== 'rider') return json({ error: 'Unknown setting.' }, 400);
  await setCustomerNotifyPref(user.id, body.topic, body.on === true);
  return json({ ok: true });
};
