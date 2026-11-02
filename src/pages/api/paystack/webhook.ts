// Paystack tells our server here when a payment goes through, even if the
// customer closed their browser. Each message is signed with our secret key;
// unsigned or wrongly signed messages are ignored. Even then, the payment is
// checked again with Paystack before the order goes to the kitchen.
//
// In the Paystack dashboard: Settings > API Keys & Webhooks > Webhook URL
//   https://your-site/api/paystack/webhook
import type { APIRoute } from 'astro';
import { handlePaystackEvent } from '../../../data/store';

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const result = await handlePaystackEvent(raw, request.headers.get('x-paystack-signature'));
  // 401 tells Paystack (or anyone else) the signature was wrong; 200 means we have it
  return new Response(null, { status: result === 'rejected' ? 401 : 200 });
};
