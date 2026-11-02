// Step 1 of customer sign-in: email a 6-digit code (see data/customers.ts).
import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { clientInfo } from '../../../lib/client-info';
import { emailReady } from '../../../lib/email';
import { CodeError, customerExists, normalizeEmail, startEmailSignIn } from '../../../data/customers';

export const POST: APIRoute = async (ctx) => {
  const body = (await ctx.request.json().catch(() => ({}))) as { email?: string; mode?: string; name?: string };
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'Enter a valid email address, for example ama@gmail.com.' }, 400);
  const mode = body.mode === 'signup' ? 'signup' : 'signin';
  if (mode === 'signup' && String(body.name ?? '').trim().length < 2) return json({ error: 'Enter your name.', field: 'name' }, 400);
  // Signing in with an email we don't know: offer to sign up instead
  const exists = await customerExists(email);
  if (mode === 'signin' && !exists) return json({ error: "There's no account with this email yet.", noAccount: true }, 404);

  // No email service yet: while developing the code shows on screen; on the live site sign-in waits
  const testMode = !emailReady() && Boolean(import.meta.env.DEV);
  if (!emailReady() && !testMode) return json({ error: "Signing in by email isn't available right now. Please try again later." }, 503);

  try {
    const sent = await startEmailSignIn(email, clientInfo(ctx).ip ?? '', { testMode });
    return json({ ok: true, email, resendIn: sent.resendIn, testCode: sent.testCode, existing: exists });
  } catch (e) {
    if (e instanceof CodeError) return json({ error: e.message, wait: e.wait || undefined }, e.wait ? 429 : 400);
    throw e;
  }
};
