-- Promo codes for people who promote Relax&Bite.
-- Each promoter gets their own code (like KOFI10). A customer who uses it gets
-- money off their first order. Relax&Bite pays for the discount: the restaurant
-- is still paid for the full food total.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

create table if not exists promo_codes (
  id              bigint generated always as identity primary key,
  code            text not null unique check (code ~ '^[A-Z0-9]{3,20}$'),
  promoter_name   text not null check (length(trim(promoter_name)) >= 2),
  promoter_phone  gh_phone,
  -- GH₵ off the customer's first order
  discount        numeric(10, 2) not null default 10 check (discount > 0 and discount <= 200),
  is_active       boolean not null default true,
  created_by      text not null default '',
  created_at      timestamptz not null default now()
);

alter table promo_codes enable row level security;
revoke all on table promo_codes from anon, authenticated;

-- Which code an order used, and how much it took off
alter table orders add column if not exists promo_code text references promo_codes (code) on update cascade;
alter table orders add column if not exists discount numeric(10, 2) not null default 0 check (discount >= 0);

-- The total now takes the discount off, and a discount can't be more than the food
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%total = (subtotal + delivery_fee)%'
      and pg_get_constraintdef(oid) not ilike '%discount%'
  loop
    execute format('alter table orders drop constraint %I', c);
  end loop;
end $$;
alter table orders drop constraint if exists orders_total_check;
alter table orders add constraint orders_total_check check (total = subtotal + delivery_fee - discount and discount <= subtotal);

-- One welcome discount per phone number (a cancelled order doesn't use it up)
create unique index if not exists orders_one_promo_per_phone on orders (customer_phone) where discount > 0 and status <> 'cancelled';
create index if not exists orders_promo_idx on orders (promo_code) where promo_code is not null;

notify pgrst, 'reload schema';
