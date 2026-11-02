-- Paystack payments: one row for every attempt to pay for an order.
-- If someone pays twice (two tries both go through), the extra one is
-- found here and refunded automatically.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

create table if not exists order_payments (
  reference   text primary key,
  order_id    uuid not null references orders (id) on delete cascade,
  amount      numeric(10, 2) not null check (amount >= 0),
  status      text not null default 'started' check (status in ('started', 'success', 'failed', 'refunded')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists order_payments_order_idx on order_payments (order_id);
drop trigger if exists order_payments_updated on order_payments;
create trigger order_payments_updated before update on order_payments for each row execute function set_updated_at();

alter table order_payments enable row level security;
revoke all on table order_payments from anon, authenticated;

notify pgrst, 'reload schema';
