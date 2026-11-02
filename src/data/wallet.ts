// Wallets for restaurants and riders.
// - Earned: every delivered order that was paid in the app. The restaurant gets
//   the food price (promo discounts are paid by Relax&Bite), the rider gets the
//   delivery fee. Cash orders (from before cash was switched off) don't count:
//   that money was collected by hand.
// - Withdrawing: they ask for an amount; Relax&Bite's 10% comes off (nothing in
//   a restaurant's first month) and an admin sends the rest to their MoMo.
// - Balance = earned - everything asked for (except rejected requests).

import { sql, sqlOne, UserError } from '../lib/supabase';
import { normalizePhone, phoneProblem } from '../lib/format';
import { SITE, commissionFor } from './site';
import type { PartnerAccount } from './types';

export type Network = 'mtn' | 'telecel' | 'airteltigo';
export const NETWORK_LABEL: Record<Network, string> = { mtn: 'MTN', telecel: 'Telecel', airteltigo: 'AirtelTigo' };

export type Withdrawal = {
  id: number;
  account_id: string;
  role: 'vendor' | 'rider';
  amount: number;
  fee: number;
  payout: number;
  momo_number: string;
  momo_network: Network;
  status: 'requested' | 'paid' | 'rejected';
  note: string;
  decided_by: string;
  created_at: string;
  decided_at: string | null;
};

export type Earning = { code: string; amount: number; at: string; label: string };

export type Wallet = {
  earned: number;
  withdrawn: number; // paid out or waiting
  balance: number;
  /** Relax&Bite's share on a withdrawal right now (0 in a restaurant's first month) */
  feeRate: number;
  freeUntil: string | null;
  open: Withdrawal | null;
  withdrawals: Withdrawal[];
  recent: Earning[];
};

const round = (n: number) => Math.round(n * 100) / 100;

// Delivered, paid in the app, for this person
const EARNED_VENDOR = `o.vendor_id = $1::uuid and o.status = 'delivered' and o.payment_method <> 'cash' and o.payment_status = 'paid'`;
const EARNED_RIDER = `o.rider_id = $1::uuid and o.status = 'delivered' and o.payment_method <> 'cash' and o.payment_status = 'paid'`;

/** The store or rider behind a partner account, and how its share is worked out. */
async function owner(account: PartnerAccount): Promise<{ id: string; role: 'vendor' | 'rider'; where: string; amountCol: string; approvedAt: string | null }> {
  if (account.role === 'vendor' && account.vendor_id) {
    const v = await sqlOne<{ approved_at: string | null }>('select approved_at from vendors where id = $1::uuid', [account.vendor_id]);
    return { id: account.vendor_id, role: 'vendor', where: EARNED_VENDOR, amountCol: 'o.subtotal', approvedAt: v?.approved_at ?? null };
  }
  if (account.role === 'rider' && account.rider_id) {
    return { id: account.rider_id, role: 'rider', where: EARNED_RIDER, amountCol: 'o.delivery_fee', approvedAt: null };
  }
  throw new UserError('Only restaurants and riders have a wallet.');
}

function feeRateFor(role: 'vendor' | 'rider', approvedAt: string | null): number {
  return role === 'vendor' ? commissionFor(approvedAt) : SITE.commissionRate;
}

export async function getWallet(account: PartnerAccount): Promise<Wallet> {
  const who = await owner(account);
  const [totals, withdrawals, recent] = await Promise.all([
    sqlOne<{ earned: number; withdrawn: number }>(
      `select coalesce((select sum(${who.amountCol}) from orders o where ${who.where}), 0)::numeric as earned,
              coalesce((select sum(amount) from withdrawals where account_id = $2::uuid and status <> 'rejected'), 0)::numeric as withdrawn`,
      [who.id, account.id],
    ),
    sql<Withdrawal>('select * from withdrawals where account_id = $1::uuid order by created_at desc limit 30', [account.id]),
    sql<{ code: string; amount: number; at: string; vendor_name: string }>(
      `select o.code, ${who.amountCol} as amount, coalesce((select max(e.at) from order_events e where e.order_id = o.id and e.status = 'delivered'), o.created_at) as at, o.vendor_name
       from orders o where ${who.where} order by at desc limit 15`,
      [who.id],
    ),
  ]);
  const earned = round(Number(totals?.earned ?? 0));
  const withdrawn = round(Number(totals?.withdrawn ?? 0));
  const end = who.role === 'vendor' && who.approvedAt ? new Date(new Date(who.approvedAt).getTime() + SITE.freeDays * 864e5) : null;
  return {
    earned,
    withdrawn,
    balance: round(earned - withdrawn),
    feeRate: feeRateFor(who.role, who.approvedAt),
    freeUntil: end && end.getTime() > Date.now() ? end.toISOString() : null,
    open: withdrawals.find((w) => w.status === 'requested') ?? null,
    withdrawals: withdrawals.map((w) => ({ ...w, amount: Number(w.amount), fee: Number(w.fee), payout: Number(w.payout) })),
    recent: recent.map((r) => ({ code: r.code, amount: Number(r.amount), at: r.at, label: who.role === 'vendor' ? 'Food sale' : `Delivery from ${r.vendor_name}` })),
  };
}

/** The fee and what reaches their phone for a withdrawal of `amount`. */
export function splitWithdrawal(amount: number, feeRate: number): { fee: number; payout: number } {
  const fee = round(amount * feeRate);
  return { fee, payout: round(amount - fee) };
}

/** A vendor or rider asks to withdraw. An admin sends the MoMo and marks it paid. */
export async function requestWithdrawal(account: PartnerAccount, input: { amount: number; phone: string; network: string }): Promise<Withdrawal> {
  if (account.status !== 'approved') throw new UserError('Your account needs to be approved first.');
  const wallet = await getWallet(account);
  const amount = round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new UserError('Enter how much to withdraw.');
  if (wallet.open) throw new UserError('You already have a withdrawal waiting. You can ask for another once it has been sent.');
  if (amount < SITE.minWithdrawal) throw new UserError(`The smallest withdrawal is GH₵ ${SITE.minWithdrawal}.`);
  if (amount > wallet.balance) throw new UserError(`You can withdraw up to GH₵ ${wallet.balance.toFixed(2)}.`);
  const phone = normalizePhone(input.phone);
  if (!phone) throw new UserError(phoneProblem(input.phone) ?? 'Enter your MoMo number.');
  if (!(input.network in NETWORK_LABEL)) throw new UserError('Choose your MoMo network.');
  const { fee, payout } = splitWithdrawal(amount, wallet.feeRate);
  const who = await owner(account);
  try {
    // Saved only if the balance still covers it (checked again in the database)
    const row = await sqlOne<Withdrawal>(
      `insert into withdrawals (account_id, role, amount, fee, payout, momo_number, momo_network)
       select $1::uuid, $2, $3::numeric, $4::numeric, $5::numeric, $6, $7
       where (select coalesce(sum(${who.amountCol}), 0) from orders o where ${who.where.replace('$1::uuid', '$8::uuid')})
           - (select coalesce(sum(amount), 0) from withdrawals where account_id = $1::uuid and status <> 'rejected') >= $3::numeric
       returning *`,
      [account.id, who.role, amount, fee, payout, phone, input.network, who.id],
    );
    if (!row) throw new UserError('Your balance changed. Check it and try again.');
    return row;
  } catch (e) {
    if (e instanceof UserError && e.message === 'That already exists.') throw new UserError('You already have a withdrawal waiting. You can ask for another once it has been sent.');
    throw e;
  }
}

// ---------- Admin ----------
export type WithdrawalRow = Withdrawal & { full_name: string; phone: string; business: string | null };

export async function listWithdrawals(status: 'requested' | 'done'): Promise<WithdrawalRow[]> {
  const rows = await sql<WithdrawalRow>(
    `select w.*, a.full_name, a.phone, (select v.name from vendors v where v.owner_account_id = a.id) as business
     from withdrawals w join partner_accounts a on a.id = w.account_id
     where ${status === 'requested' ? "w.status = 'requested'" : "w.status <> 'requested'"}
     order by ${status === 'requested' ? 'w.created_at' : 'w.decided_at desc nulls last'} limit 100`,
  );
  return rows.map((w) => ({ ...w, amount: Number(w.amount), fee: Number(w.fee), payout: Number(w.payout) }));
}

export async function countOpenWithdrawals(): Promise<number> {
  return (await sqlOne<{ n: number }>(`select count(*)::int as n from withdrawals where status = 'requested'`))?.n ?? 0;
}

/** The admin sent the MoMo (note: the transaction ID). */
export async function markWithdrawalPaid(id: number, by: string, note: string): Promise<Withdrawal> {
  const row = await sqlOne<Withdrawal>(
    `update withdrawals set status = 'paid', note = $3, decided_by = $2, decided_at = now()
     where id = $1::bigint and status = 'requested' returning *`,
    [id, by.slice(0, 120), note.trim().slice(0, 120)],
  );
  if (!row) throw new UserError('This withdrawal has already been dealt with.');
  return row;
}

/** Not sent: the amount goes back into their wallet. Needs a reason they'll see. */
export async function rejectWithdrawal(id: number, by: string, reason: string): Promise<Withdrawal> {
  if (!reason.trim()) throw new UserError('Add a short reason. They will see it.');
  const row = await sqlOne<Withdrawal>(
    `update withdrawals set status = 'rejected', note = $3, decided_by = $2, decided_at = now()
     where id = $1::bigint and status = 'requested' returning *`,
    [id, by.slice(0, 120), reason.trim().slice(0, 200)],
  );
  if (!row) throw new UserError('This withdrawal has already been dealt with.');
  return row;
}
