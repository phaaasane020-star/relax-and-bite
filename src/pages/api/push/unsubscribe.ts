// Turn notifications off on this phone or browser.
import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { getPartnerToken, getUser } from '../../../lib/session';
import { getSessionAccount } from '../../../data/partners';
import { removePushSubscription } from '../../../data/push';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => ({}))) as { as?: string; endpoint?: string };
  if (body.as === 'customer') {
    const user = getUser(cookies);
    if (!user) return json({ error: 'Sign in again.' }, 401);
    if (body.endpoint) await removePushSubscription({ customer: user.id }, String(body.endpoint));
    return json({ ok: true });
  }
  const account = await getSessionAccount(getPartnerToken(cookies));
  if (!account) return json({ error: 'Sign in again.' }, 401);
  if (body.endpoint) await removePushSubscription({ account: account.id }, String(body.endpoint));
  return json({ ok: true });
};
