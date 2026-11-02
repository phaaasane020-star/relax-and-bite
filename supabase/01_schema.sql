-- =====================================================================
-- Relax&Bite database schema (Supabase / PostgreSQL)
--
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Run it once, on a new project. Then run 02_seed.sql.
--
-- Security model: the app talks to the database only from the server
-- (Astro on Netlify) using the service role key, which never reaches
-- phones or browsers. Row Level Security is switched on for every table
-- with no public policies, so the public "anon" key can read nothing.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type partner_role as enum ('vendor', 'rider', 'admin');
create type account_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type vendor_status as enum ('pending', 'approved', 'suspended');
create type vehicle_type as enum ('motorbike', 'bicycle');
create type order_status as enum ('pending_payment', 'placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled');
create type payment_method as enum ('momo', 'card', 'cash');
create type payment_status as enum ('unpaid', 'paid', 'failed', 'refunded');
create type reporter_role as enum ('customer', 'vendor', 'rider');
create type issue_status as enum ('open', 'resolved');
create type activity_kind as enum ('signin', 'signin_failed', 'lockout', 'signout', 'register', 'order', 'store', 'delivery', 'report', 'admin');
create type activity_severity as enum ('info', 'warning', 'danger');

-- Ghana mobile number as stored by the app: 10 digits starting with 0
create domain gh_phone as text check (value ~ '^0[2-5][0-9]{8}$');

-- Keeps updated_at current on every change
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Towns and localities
-- ---------------------------------------------------------------------
create table zones (
  id           bigint generated always as identity primary key,
  name         text not null check (length(trim(name)) between 2 and 60),
  region       text not null default 'Central',
  delivery_fee numeric(10, 2) not null check (delivery_fee >= 0),
  is_active    boolean not null default false,
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  radius_km    numeric(5, 1) not null default 6 check (radius_km > 0 and radius_km <= 50),
  created_at   timestamptz not null default now()
);
create unique index zones_name_region_key on zones (lower(name), lower(region));

create table localities (
  id         bigint generated always as identity primary key,
  zone_id    bigint not null references zones (id) on delete cascade,
  name       text not null check (length(trim(name)) between 2 and 60),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index localities_zone_name_key on localities (zone_id, lower(name));

-- ---------------------------------------------------------------------
-- Partner accounts (vendors, riders, admins): phone + password
-- ---------------------------------------------------------------------
create table partner_accounts (
  id             uuid primary key default gen_random_uuid(),
  role           partner_role not null,
  full_name      text not null check (length(trim(full_name)) >= 3),
  phone          gh_phone not null unique,
  password_hash  text not null, -- "salt:hash" (scrypt), made by the app
  status         account_status not null default 'pending',
  status_reason  text not null default '',
  failed_logins  integer not null default 0,
  locked_until   timestamptz,
  last_signin_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger partner_accounts_updated before update on partner_accounts for each row execute function set_updated_at();

-- Signed-in partners. Only a hash of the cookie token is stored.
create table partner_sessions (
  token_hash text primary key,
  account_id uuid not null references partner_accounts (id) on delete cascade,
  expires_at timestamptz not null,
  ip         text,
  device     text,
  created_at timestamptz not null default now()
);
create index partner_sessions_account_idx on partner_sessions (account_id);

-- ---------------------------------------------------------------------
-- Vendors and menus
-- ---------------------------------------------------------------------
create table vendors (
  id                   uuid primary key default gen_random_uuid(),
  owner_account_id     uuid unique references partner_accounts (id) on delete set null,
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                 text not null check (length(trim(name)) >= 2),
  description          text not null default '',
  cuisine_tags         text[] not null default '{}',
  address              text not null default '',
  zone_id              bigint not null references zones (id),
  locality_id          bigint references localities (id) on delete set null,
  phone                gh_phone not null,
  cover_url            text,
  prep_time_min        integer not null default 15 check (prep_time_min > 0),
  prep_time_max        integer not null default 30,
  min_order            numeric(10, 2) not null default 0 check (min_order >= 0),
  is_open              boolean not null default false,
  opens_at             time not null default '07:00',
  closes_at            time not null default '21:00',
  rating               numeric(2, 1) not null default 0,
  rating_count         integer not null default 0,
  status               vendor_status not null default 'pending',
  -- Payouts (Paystack split payments)
  paystack_subaccount  text,
  payout_momo_number   gh_phone,
  payout_network       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (prep_time_max >= prep_time_min)
);
create index vendors_zone_idx on vendors (zone_id);
create trigger vendors_updated before update on vendors for each row execute function set_updated_at();

create table menu_categories (
  id         bigint generated always as identity primary key,
  vendor_id  uuid not null references vendors (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0
);
create unique index menu_categories_vendor_name_key on menu_categories (vendor_id, lower(name));

create table menu_items (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors (id) on delete cascade,
  category_id  bigint references menu_categories (id) on delete set null,
  name         text not null check (length(trim(name)) between 1 and 80),
  description  text not null default '',
  price        numeric(10, 2) not null check (price > 0),
  image_url    text,
  -- Choice groups: [{ name, required, max, choices: [{ name, price }] }]
  options      jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  is_available boolean not null default true,
  is_popular   boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index menu_items_vendor_idx on menu_items (vendor_id);
create trigger menu_items_updated before update on menu_items for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Riders
-- ---------------------------------------------------------------------
create table riders (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null unique references partner_accounts (id) on delete cascade,
  full_name             text not null,
  phone                 gh_phone not null,
  zone_id               bigint not null references zones (id),
  vehicle               vehicle_type not null default 'motorbike',
  plate_number          text not null default '',
  licence_number        text not null default '',
  ghana_card            text not null check (ghana_card ~ '^GHA-[0-9]{9}-[0-9]$'),
  photo_url             text,  -- passport photo, shown to customers and vendors
  ghana_card_photo_path text,  -- private storage path, admin only
  emergency_name        text not null,
  emergency_phone       gh_phone not null,
  is_online             boolean not null default false,
  rating                numeric(2, 1) not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (emergency_phone <> phone),
  check (vehicle = 'bicycle' or (plate_number <> '' and licence_number <> ''))
);
create unique index riders_ghana_card_key on riders (ghana_card);
create trigger riders_updated before update on riders for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Customers (old phone sign-in; replaced by email/Google accounts in 10_email_accounts.sql)
-- ---------------------------------------------------------------------
create table customers (
  phone          gh_phone primary key,
  name           text not null default '',
  cash_blocked   boolean not null default false, -- after unpaid or fake cash orders
  created_at     timestamptz not null default now(),
  last_signin_at timestamptz
);

create table customer_otps (
  id         bigint generated always as identity primary key,
  phone      gh_phone not null,
  code_hash  text not null,
  attempts   integer not null default 0,
  expires_at timestamptz not null,
  used_at    timestamptz,
  ip         text,
  created_at timestamptz not null default now()
);
create index customer_otps_phone_idx on customer_otps (phone, created_at desc);

create table customer_favourites (
  customer_phone gh_phone not null references customers (phone) on delete cascade,
  kind           text not null check (kind in ('vendor', 'item')),
  target_id      uuid not null,
  created_at     timestamptz not null default now(),
  primary key (customer_phone, kind, target_id)
);

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
create sequence order_number_seq start 1001;

-- 4 random digits from a secure source, e.g. "0473"
create function new_delivery_code() returns text language sql volatile as $$
  select lpad(((('x' || encode(gen_random_bytes(3), 'hex'))::bit(24)::int) % 10000)::text, 4, '0')
$$;

create table orders (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique default ('RB-' || nextval('order_number_seq')),
  vendor_id              uuid not null references vendors (id),
  -- Copies taken when the order is placed, so the receipt never changes
  vendor_name            text not null,
  vendor_slug            text not null,
  vendor_phone           text not null,
  vendor_address         text not null default '',
  rider_id               uuid references riders (id) on delete set null,
  rider_name             text not null default '',
  rider_phone            text not null default '',
  rider_assigned_at      timestamptz,
  status                 order_status not null default 'placed',
  payment_method         payment_method not null,
  payment_status         payment_status not null default 'unpaid',
  paystack_reference     text unique,
  subtotal               numeric(10, 2) not null check (subtotal >= 0),
  delivery_fee           numeric(10, 2) not null check (delivery_fee >= 0),
  total                  numeric(10, 2) not null,
  commission_rate        numeric(4, 3) not null default 0.100,
  commission             numeric(10, 2) generated always as (round(subtotal * commission_rate, 2)) stored,
  zone_id                bigint not null references zones (id),
  zone_name              text not null,
  locality_id            bigint references localities (id) on delete set null,
  locality_name          text not null default '',
  delivery_landmark      text not null default '',
  delivery_address       text not null default '',
  customer_phone         gh_phone not null,
  note                   text not null default '',
  cancel_reason          text not null default '',
  delivery_code          text not null default new_delivery_code() check (delivery_code ~ '^[0-9]{4}$'),
  delivery_code_attempts integer not null default 0,
  rating                 smallint check (rating between 1 and 5),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (total = subtotal + delivery_fee)
);
create index orders_vendor_idx on orders (vendor_id, created_at desc);
create index orders_rider_idx on orders (rider_id, created_at desc);
create index orders_customer_idx on orders (customer_phone, created_at desc);
create index orders_active_idx on orders (status) where status not in ('delivered', 'cancelled');
create trigger orders_updated before update on orders for each row execute function set_updated_at();

create table order_items (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references orders (id) on delete cascade,
  menu_item_id uuid references menu_items (id) on delete set null,
  name         text not null,
  unit_price   numeric(10, 2) not null check (unit_price >= 0),
  quantity     integer not null check (quantity between 1 and 50),
  options      jsonb not null default '[]', -- [{ group, choice, price }]
  line_total   numeric(10, 2) not null
);
create index order_items_order_idx on order_items (order_id);

-- Timeline shown to the customer: placed, accepted, ready, picked up, delivered
create table order_events (
  id       bigint generated always as identity primary key,
  order_id uuid not null references orders (id) on delete cascade,
  status   order_status not null,
  note     text,
  by_name  text,
  at       timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id, at);

-- Keep each restaurant's star rating up to date when customers rate orders
create function refresh_vendor_rating() returns trigger language plpgsql as $$
begin
  if new.rating is distinct from old.rating then
    update vendors v
       set rating = coalesce((select round(avg(rating)::numeric, 1) from orders where vendor_id = v.id and rating is not null), 0),
           rating_count = (select count(*) from orders where vendor_id = v.id and rating is not null)
     where v.id = new.vendor_id;
  end if;
  return new;
end $$;
create trigger orders_rating_changed after update of rating on orders for each row execute function refresh_vendor_rating();

-- ---------------------------------------------------------------------
-- Safety: problem reports
-- ---------------------------------------------------------------------
create table issues (
  id             uuid primary key default gen_random_uuid(),
  order_code     text references orders (code) on delete set null,
  reporter_role  reporter_role not null,
  reporter_name  text not null default '',
  reporter_phone text not null default '',
  category       text not null,
  message        text not null default '' check (length(message) <= 600),
  status         issue_status not null default 'open',
  resolution     text not null default '',
  resolved_by    text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index issues_open_idx on issues (created_at desc) where status = 'open';

-- ---------------------------------------------------------------------
-- Activity log: every sign-in, failed attempt and action.
-- Append-only: rows can be added but never changed or deleted.
-- ---------------------------------------------------------------------
create table activity_log (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  actor    text not null,
  action   text not null,
  kind     activity_kind not null,
  severity activity_severity not null default 'info',
  ip       text,
  device   text
);
create index activity_log_at_idx on activity_log (at desc);
create index activity_log_kind_idx on activity_log (kind, at desc);

create function activity_log_is_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'The activity log cannot be changed or deleted.';
end $$;
create trigger activity_log_no_update before update or delete on activity_log for each row execute function activity_log_is_append_only();
create trigger activity_log_no_truncate before truncate on activity_log for each statement execute function activity_log_is_append_only();

-- ---------------------------------------------------------------------
-- Store visits, for the vendor "Sales and visits" page
-- ---------------------------------------------------------------------
create table store_traffic (
  vendor_id       uuid not null references vendors (id) on delete cascade,
  day             date not null,
  views           integer not null default 0,
  unique_visitors integer not null default 0,
  add_to_cart     integer not null default 0,
  item_views      jsonb not null default '{}', -- { menu_item_id: count }
  primary key (vendor_id, day)
);

create table store_visitors (
  vendor_id  uuid not null references vendors (id) on delete cascade,
  day        date not null,
  visitor_id text not null,
  primary key (vendor_id, day, visitor_id)
);

-- One call per store page view: counts the view and, once a day, the visitor
create function record_store_visit(p_vendor uuid, p_visitor text) returns void language plpgsql as $$
declare
  is_new boolean;
begin
  insert into store_visitors (vendor_id, day, visitor_id) values (p_vendor, current_date, p_visitor)
  on conflict do nothing;
  is_new := found;
  insert into store_traffic (vendor_id, day, views, unique_visitors) values (p_vendor, current_date, 1, case when is_new then 1 else 0 end)
  on conflict (vendor_id, day) do update
    set views = store_traffic.views + 1,
        unique_visitors = store_traffic.unique_visitors + case when is_new then 1 else 0 end;
end $$;

create function record_item_view(p_vendor uuid, p_item uuid) returns void language plpgsql as $$
begin
  insert into store_traffic (vendor_id, day, item_views) values (p_vendor, current_date, jsonb_build_object(p_item::text, 1))
  on conflict (vendor_id, day) do update
    set item_views = jsonb_set(store_traffic.item_views, array[p_item::text],
                               to_jsonb(coalesce((store_traffic.item_views ->> p_item::text)::int, 0) + 1));
end $$;

create function record_add_to_cart(p_vendor uuid) returns void language plpgsql as $$
begin
  insert into store_traffic (vendor_id, day, add_to_cart) values (p_vendor, current_date, 1)
  on conflict (vendor_id, day) do update set add_to_cart = store_traffic.add_to_cart + 1;
end $$;

-- Housekeeping, safe to run daily: old visitor ids, codes and sessions
create function clean_up_old_rows() returns void language sql as $$
  delete from store_visitors where day < current_date - 2;
  delete from customer_otps where created_at < now() - interval '1 day';
  delete from partner_sessions where expires_at < now();
$$;

-- ---------------------------------------------------------------------
-- Lock everything down: nothing is readable with the public key
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'zones', 'localities', 'partner_accounts', 'partner_sessions', 'vendors', 'menu_categories', 'menu_items',
    'riders', 'customers', 'customer_otps', 'customer_favourites', 'orders', 'order_items', 'order_events',
    'issues', 'activity_log', 'store_traffic', 'store_visitors'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------
-- Photo storage (runs only on Supabase, where the storage schema exists)
--   menu-photos, store-covers, rider-photos: public, shown in the app
--   rider-documents: private (Ghana Card photos), admin only
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('menu-photos', 'menu-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
      ('store-covers', 'store-covers', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
      ('rider-photos', 'rider-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
      ('rider-documents', 'rider-documents', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
