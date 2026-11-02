// The app opens this with the one-time ticket from Google sign-in in the
// phone's browser; the ticket becomes a signed-in session inside the app.
import type { APIRoute } from 'astro';
import { claimAppTicket } from '../../../data/customers';
import { safeNext, setUser } from '../../../lib/session';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const customer = await claimAppTicket(url.searchParams.get('ticket') ?? '');
  if (!customer) return redirect('/account?signin=1&google=failed', 303);
  setUser(cookies, { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone });
  return redirect(safeNext(url.searchParams.get('next'), '/'), 303);
};
