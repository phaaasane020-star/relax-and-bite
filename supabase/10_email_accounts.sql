-- Customers sign in with their email (a 6-digit code) or with Google, instead
-- of an SMS code. Vendors and riders can add an email to get order alerts.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

-- A customer account: one per email address
create table if not exists customer_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name           text not null default '',
  -- the phone number they last ordered with, filled in at checkout next time
  phone          gh_phone,
  -- set when they've signed in with Google
  google_sub     text unique,
  created_at     timestamptz not null default now(),
  last_signin_at timestamptz
);

-- Sign-in codes sent by email: only a hash is kept
create table if not exists customer_email_codes (
  id         bigint generated always as identity primary key,
  email      text not null,
  code_hash  text not null,
  attempts   integer not null default 0,
  expires_at timestamptz not null,
  used_at    timestamptz,
  ip         text,
  created_at timestamptz not null default now()
);
create index if not exists customer_email_codes_email_idx on customer_email_codes (email, created_at desc);

-- One-time tickets that carry a Google sign-in from the phone's browser back into the app
create table if not exists app_signin_tickets (
  ticket_hash text primary key,
  user_id     uuid not null references customer_users (id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- Orders remember which account placed them
alter table orders add column if not exists customer_id uuid references customer_users (id) on delete set null;
create index if not exists orders_customer_id_idx on orders (customer_id, created_at desc);
-- One welcome discount per account too (as well as per phone number)
create unique index if not exists orders_one_promo_per_customer on orders (customer_id)
  where discount > 0 and status <> 'cancelled' and customer_id is not null;

-- Vendors and riders: an email for order alerts (optional)
alter table partner_accounts add column if not exists email text
  check (email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

do $$
declare
  t text;
begin
  foreach t in array array['customer_users', 'customer_email_codes', 'app_signin_tickets'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
