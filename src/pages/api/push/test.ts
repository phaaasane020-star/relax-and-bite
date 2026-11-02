// "Send a test": a notification to every device this account turned them on for.
import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { getPartnerToken, getUser } from '../../../lib/session';
import { getSessionAccount } from '../../../data/partners';
import { pushToAccounts, pushToCustomer } from '../../../data/push';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => ({}))) as { as?: string };
  if (body.as === 'customer') {
    const user = getUser(cookies);
    if (!user) return json({ error: 'Sign in again.' }, 401);
    const sent = await pushToCustomer(user.id, 'test', { title: 'Notifications are on', body: "This is how you'll hear about your orders.", url: '/orders', tag: 'test' });
    return json({ ok: true, sent });
  }
  const account = await getSessionAccount(getPartnerToken(cookies));
  if (!account || account.status !== 'approved') return json({ error: 'Sign in again.' }, 401);
  const home = account.role === 'admin' ? '/admin' : account.role === 'vendor' ? '/vendor' : '/rider';
  const sent = await pushToAccounts([account.id], { title: 'Notifications are on', body: "This is how you'll hear about new orders.", url: home, tag: 'test' });
  return json({ ok: true, sent });
};
