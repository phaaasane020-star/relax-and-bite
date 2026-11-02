// Step 2 of customer sign-in: check the emailed code, then remember them on this device.
import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { setUser } from '../../../lib/session';
import { audit } from '../../../data/store';
import { clientInfo } from '../../../lib/client-info';
import { CodeError, normalizeEmail, setNameIfEmpty, verifyEmailSignIn } from '../../../data/customers';

export const POST: APIRoute = async (ctx) => {
  const { request, cookies } = ctx;
  const body = (await request.json().catch(() => ({}))) as { email?: string; code?: string; name?: string };
  const email = normalizeEmail(body.email);
  const code = String(body.code ?? '').replace(/\D/g, '');
  if (!email) return json({ error: 'Start again with your email address.' }, 400);
  if (code.length !== 6) return json({ error: 'Enter the 6-digit code from the email.' }, 400);

  try {
    const customer = await verifyEmailSignIn(email, code);
    if (body.name) customer.name = await setNameIfEmpty(customer.id, String(body.name));
    setUser(cookies, { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone });
    await audit(`Customer ${customer.email}`, 'Signed in with an email code', { kind: 'signin', ...clientInfo(ctx) });
    return json({ ok: true });
  } catch (e) {
    if (!(e instanceof CodeError)) throw e;
    if (e.wrong) await audit(`Customer ${email}`, 'Entered a wrong sign-in code', { kind: 'signin_failed', severity: 'warning', ...clientInfo(ctx) });
    return json({ error: e.message }, 400);
  }
};
