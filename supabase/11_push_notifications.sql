-- Phone and computer notifications for vendors, riders and admins.
-- Each phone/browser that allowed notifications is one row.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

create table if not exists push_subscriptions (
  id           bigint generated always as identity primary key,
  account_id   uuid not null references partner_accounts (id) on delete cascade,
  -- 'web': a browser (Chrome, Edge, Firefox...); 'fcm': the Android app (Firebase)
  kind         text not null check (kind in ('web', 'fcm')),
  -- web: the browser's push address; fcm: the app's Firebase token
  endpoint     text not null unique,
  p256dh       text,
  auth         text,
  device       text not null default '',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_account_idx on push_subscriptions (account_id);

alter table push_subscriptions enable row level security;
revoke all on table push_subscriptions from anon, authenticated;

notify pgrst, 'reload schema';
