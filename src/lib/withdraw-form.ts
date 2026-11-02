// The Withdraw form on the vendor and rider Wallet pages.
import type { AstroCookies } from 'astro';
import type { PartnerAccount } from '../data/types';
import { requestWithdrawal } from '../data/wallet';
import { notifyWithdrawalRequested } from '../data/notify';
import { audit } from '../data/store';
import { clientInfo } from './client-info';
import { field, flash } from './actions';
import { money, prettyPhone } from './format';
import { UserError } from './supabase';

export type WithdrawTyped = { amount: string; phone: string; network: string };

type Ctx = { request: Request; cookies: AstroCookies; url: URL; clientAddress?: string; redirect: (path: string, status?: 301 | 302 | 303 | 307 | 308) => Response };

export async function handleWithdrawForm(Astro: Ctx, account: PartnerAccount): Promise<Response | { error: string; typed: WithdrawTyped }> {
  const form = await Astro.request.formData();
  const typed = { amount: field(form, 'amount', 12), phone: field(form, 'phone', 20), network: field(form, 'network', 12) };
  try {
    const w = await requestWithdrawal(account, { amount: Number(typed.amount), phone: typed.phone, network: typed.network });
    await audit(`${account.full_name} (${account.role})`, `Asked to withdraw GH₵ ${Number(w.amount).toFixed(2)} (${money(Number(w.payout))} to ${prettyPhone(w.momo_number)})`, { kind: 'admin', ...clientInfo(Astro) });
    await notifyWithdrawalRequested(account.full_name, Number(w.payout));
    flash(Astro.cookies, `Withdrawal requested. ${money(Number(w.payout))} will be sent to ${prettyPhone(w.momo_number)}.`);
    return Astro.redirect(Astro.url.pathname, 303);
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    return { error: e.message, typed };
  }
}
