// "Continue with Google": off to Google's own sign-in page.
// From the app (?app=1) this opens in the phone's browser, because Google
// doesn't allow its sign-in inside apps; the browser then hands the sign-in
// back to the app (see google/callback.ts and MainActivity).
import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { googleReady, googleSignInUrl } from '../../../data/customers';
import { safeNext } from '../../../lib/session';
import { signValue } from '../../../lib/sign';
import { siteOrigin } from '../../../lib/site-url';

export const GET: APIRoute = async (ctx) => {
  const { url, cookies, redirect } = ctx;
  if (!googleReady()) return redirect(`/account?signin=1&google=off`, 303);
  const app = url.searchParams.get('app') === '1';
  const next = safeNext(url.searchParams.get('next'), '/');
  // A random value that must come back unchanged, so nobody can fake the reply
  const nonce = randomBytes(16).toString('base64url');
  const state = signValue({ nonce, app, next, exp: Date.now() + 10 * 60 * 1000 });
  cookies.set('rb_google', nonce, { path: '/', maxAge: 600, httpOnly: true, sameSite: 'lax', secure: import.meta.env.PROD === true });
  return redirect(googleSignInUrl(`${siteOrigin(url)}/api/auth/google/callback`, state), 302);
};
