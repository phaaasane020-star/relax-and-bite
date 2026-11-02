// Someone allowed notifications on this phone or browser: remember it.
// Vendors, riders and admins by default; customers send { as: 'customer' }.
import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { getPartnerToken, getUser } from '../../../lib/session';
import { getSessionAccount } from '../../../data/partners';
import { savePushSubscription, type PushOwner } from '../../../data/push';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => ({}))) as {
    as?: string;
    kind?: string;
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  let owner: PushOwner;
  if (body.as === 'customer') {
    const user = getUser(cookies);
    if (!user) return json({ error: 'Sign in again to turn on notifications.' }, 401);
    owner = { customer: user.id };
  } else {
    const account = await getSessionAccount(getPartnerToken(cookies));
    if (!account || account.status !== 'approved') return json({ error: 'Sign in again to turn on notifications.' }, 401);
    owner = { account: account.id };
  }
  try {
    await savePushSubscription(owner, {
      kind: body.kind === 'fcm' ? 'fcm' : 'web',
      endpoint: String(body.endpoint ?? ''),
      p256dh: body.keys?.p256dh,
      auth: body.keys?.auth,
      device: (request.headers.get('user-agent') ?? '').slice(0, 120),
    });
  } catch {
    return json({ error: "This device's notification details didn't look right. Try again." }, 400);
  }
  return json({ ok: true });
};
