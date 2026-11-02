// Handles the "Your account" form in the vendor, rider and admin panels:
// changing the name shown on the account, and changing the password.
import type { AstroCookies } from 'astro';
import type { PartnerAccount } from '../data/types';
import { changePassword, updateAccountEmail, updateAccountName } from '../data/partners';
import { audit } from '../data/store';
import { field, flash } from './actions';
import { clientInfo } from './client-info';
import { getPartnerToken } from './session';
import { UserError } from './supabase';

type Ctx = {
  request: Request;
  cookies: AstroCookies;
  url: URL;
  clientAddress?: string;
  redirect: (path: string, status?: 301 | 302 | 303 | 307 | 308) => Response;
};

const KIND = { admin: 'admin', vendor: 'store', rider: 'delivery' } as const;

/** Returns a redirect after a successful change, or the message to show. */
export async function handleAccountForm(ctx: Ctx, account: PartnerAccount): Promise<Response | { error: string }> {
  const form = await ctx.request.formData();
  const action = field(form, 'action', 20);
  const info = clientInfo(ctx);
  const kind = KIND[account.role];
  try {
    if (action === 'name') {
      const before = account.full_name;
      const name = await updateAccountName(account.id, field(form, 'full_name', 80));
      if (name !== before) await audit(`${name} (${account.role})`, `Changed the account name from "${before}" to "${name}"`, { kind, ...info });
      flash(ctx.cookies, 'Your name is saved.');
    } else if (action === 'email' && account.role !== 'admin') {
      const email = await updateAccountEmail(account.id, field(form, 'email', 254));
      if (email !== (account.email ?? null)) {
        await audit(`${account.full_name} (${account.role})`, email ? `Set the order-alert email to ${email}` : 'Turned off order-alert emails', { kind, ...info });
      }
      flash(ctx.cookies, email ? `Order alerts will go to ${email}.` : 'Order alert emails are off.');
    } else if (action === 'password') {
      const next = String(form.get('new_password') ?? '');
      if (next !== String(form.get('confirm_password') ?? '')) throw new UserError('The two new passwords are not the same.');
      await changePassword(account.id, String(form.get('current_password') ?? ''), next, getPartnerToken(ctx.cookies));
      await audit(`${account.full_name} (${account.role})`, 'Changed their password. Other devices were signed out.', { kind, severity: 'warning', ...info });
      flash(ctx.cookies, 'Your password is changed. Any other phone or computer signed in to this account has been signed out.');
    } else {
      throw new UserError('Something went wrong. Try again.');
    }
    return ctx.redirect(ctx.url.pathname, 303);
  } catch (e) {
    if (action === 'password' && e instanceof UserError && /current password/i.test(e.message)) {
      await audit(`${account.full_name} (${account.role})`, 'Tried to change the password with the wrong current password', { kind, severity: 'warning', ...info });
    }
    return { error: e instanceof UserError ? e.message : 'Could not save. Try again.' };
  }
}
