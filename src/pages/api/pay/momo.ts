// Mobile Money inside the app: send the prompt, type an SMS code, or check
// whether the payment has come through. Only the person who placed the order.
import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { ownsOrder } from '../../../lib/session';
import { getOrderByCode, momoStatus, startMomoCharge, submitMomoOtp } from '../../../data/store';
import { UserError } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => ({}))) as { step?: string; code?: string; phone?: string; network?: string; otp?: string };
  const order = body.code ? await getOrderByCode(String(body.code)) : undefined;
  if (!order || !ownsOrder(cookies, order)) return json({ error: 'Order not found.' }, 404);
  try {
    if (body.step === 'start') return json(await startMomoCharge(order.code, String(body.phone ?? ''), String(body.network ?? '')));
    if (body.step === 'otp') return json(await submitMomoOtp(order.code, String(body.otp ?? '')));
    if (body.step === 'status') return json(await momoStatus(order.code));
    return json({ error: 'Unknown step.' }, 400);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    console.error('[pay] momo:', (e as Error).message);
    return json({ error: (e as Error).message || "Couldn't reach the payment service. Try again." }, 502);
  }
};
