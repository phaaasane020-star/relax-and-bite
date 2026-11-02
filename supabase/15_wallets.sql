-- Wallets for restaurants and riders.
-- Money from each delivered order (paid in the app) goes into their wallet:
-- the food price to the restaurant, the delivery fee to the rider. When they
-- withdraw, Relax&Bite's 10% comes off and an admin sends the rest by MoMo.
-- Balances are worked out from orders and withdrawals, so they can't drift.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

create table if not exists withdrawals (
  id            bigint generated always as identity primary key,
  account_id    uuid not null references partner_accounts (id) on delete cascade,
  role          text not null check (role in ('vendor', 'rider')),
  amount        numeric(10, 2) not null check (amount > 0),        -- taken from the wallet
  fee           numeric(10, 2) not null check (fee >= 0),          -- Relax&Bite's share
  payout        numeric(10, 2) not null check (payout >= 0),       -- sent to their MoMo
  momo_number   gh_phone not null,
  momo_network  text not null check (momo_network in ('mtn', 'telecel', 'airteltigo')),
  status        text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  note          text not null default '',                           -- MoMo transaction ID, or why it was rejected
  decided_by    text not null default '',
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists withdrawals_account_idx on withdrawals (account_id, created_at desc);
create index if not exists withdrawals_status_idx on withdrawals (status, created_at);
-- One request waiting at a time per person (also stops a double tap withdrawing twice)
create unique index if not exists withdrawals_one_open on withdrawals (account_id) where status = 'requested';

alter table withdrawals enable row level security;
revoke all on table withdrawals from anon, authenticated;

notify pgrst, 'reload schema';
