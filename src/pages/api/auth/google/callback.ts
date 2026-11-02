// Google sends the person back here. We check the reply with Google, sign
// them in, and either go on (website) or hand the sign-in to the app.
import type { APIRoute } from 'astro';
import { createAppTicket, finishGoogleSignIn } from '../../../../data/customers';
import { audit } from '../../../../data/store';
import { readSigned } from '../../../../lib/sign';
import { setUser } from '../../../../lib/session';
import { clientInfo } from '../../../../lib/client-info';
import { siteOrigin } from '../../../../lib/site-url';

/** The app's own address scheme (AndroidManifest.xml): opens the app with the ticket */
const APP_SCHEME = 'relaxbite';

export const GET: APIRoute = async (ctx) => {
  const { url, cookies, redirect } = ctx;
  const state = readSigned<{ nonce: string; app: boolean; next: string; exp: number }>(url.searchParams.get('state') ?? undefined);
  const nonce = cookies.get('rb_google')?.value;
  cookies.delete('rb_google', { path: '/' });
  const code = url.searchParams.get('code');
  if (!state || state.exp < Date.now() || !nonce || state.nonce !== nonce) return redirect('/?signin=1&google=failed', 303);
  if (!code) return redirect('/?signin=1&google=cancelled', 303); // they closed Google's page

  try {
    const customer = await finishGoogleSignIn(code, `${siteOrigin(url)}/api/auth/google/callback`);
    await audit(`Customer ${customer.email}`, 'Signed in with Google', { kind: 'signin', ...clientInfo(ctx) });
    if (state.app) {
      // Back to the app, which swaps the ticket for a session (api/auth/claim)
      const ticket = await createAppTicket(customer.id);
      const back = `${APP_SCHEME}://signin?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(state.next)}`;
      // Some browsers only open an app after a tap, so there's a button as well
      return new Response(backToAppPage(back), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    setUser(cookies, { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone });
    return redirect(state.next || '/', 303);
  } catch (e) {
    console.error('[google] sign-in failed:', (e as Error).message);
    return redirect('/?signin=1&google=failed', 303);
  }
};

function backToAppPage(href: string): string {
  const h = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Back to Relax&amp;Bite</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font-family:Inter,system-ui,sans-serif;background:#fff;color:#3f292b;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:22px;margin:0 0 8px}p{color:#7a6a6b;margin:0 0 22px;line-height:1.5}
a{display:inline-block;background:#ef4444;color:#fff;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:12px}</style></head>
<body><main><h1>You're signed in</h1><p>Go back to the Relax&amp;Bite app to carry on.</p><a href="${h}">Open Relax&amp;Bite</a></main>
<script>location.href=${JSON.stringify(href).replace(/</g, '\\u003c')};</script></body></html>`;
}
