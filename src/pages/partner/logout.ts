import type { APIRoute } from 'astro';
import { accountLabel, endSession, getSessionAccount } from '../../data/partners';
import { audit } from '../../data/store';
import { clientInfo } from '../../lib/client-info';
import { clearPartnerToken, getPartnerToken } from '../../lib/session';

export const POST: APIRoute = async (ctx) => {
  const { cookies, redirect } = ctx;
  const token = getPartnerToken(cookies);
  const account = await getSessionAccount(token);
  if (account) await audit(accountLabel(account), 'Signed out', { kind: 'signout', ...clientInfo(ctx) });
  await endSession(token);
  clearPartnerToken(cookies);
  return redirect('/partner/login', 303);
};
