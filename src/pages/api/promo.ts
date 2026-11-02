// Checkout asks here whether a promo code works before the order is placed,
// so the discount shows in the total. The order itself checks again.
import type { APIRoute } from 'astro';
import { json } from '../../lib/http';
import { checkPromo } from '../../data/store';
import { getUser } from '../../lib/session';
import { normalizePhone } from '../../lib/format';
import { UserError } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => ({}))) as { code?: string; phone?: string };
  const user = getUser(cookies);
  if (!user) return json({ error: 'Sign in to use a promo code.', signIn: true }, 400);
  const phone = normalizePhone(String(body.phone ?? ''));
  try {
    const promo = await checkPromo(body.code, { phone, customerId: user.id });
    return json({ code: promo.code, discount: promo.discount });
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    throw e;
  }
};
