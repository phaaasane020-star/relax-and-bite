-- App notifications for customers too (order and rider updates), with
-- on/off switches on their Notifications page.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

-- A phone/browser now belongs to a partner account OR a customer
alter table push_subscriptions alter column account_id drop not null;
alter table push_subscriptions add column if not exists customer_id uuid references customer_users (id) on delete cascade;
create index if not exists push_subscriptions_customer_idx on push_subscriptions (customer_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_one_owner') then
    alter table push_subscriptions add constraint push_subscriptions_one_owner check ((account_id is null) <> (customer_id is null));
  end if;
end $$;

-- What the customer wants to hear about
alter table customer_users add column if not exists notify_orders boolean not null default true;
alter table customer_users add column if not exists notify_rider boolean not null default true;

notify pgrst, 'reload schema';
