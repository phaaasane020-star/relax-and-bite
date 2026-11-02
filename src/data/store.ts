// Data access for the storefront and the three panels, on Supabase.
// Pages only talk to these functions; every query is plain SQL sent through
// lib/supabase.ts (server only).
import { sql, sqlOne, UserError } from '../lib/supabase';
import { isUuid } from '../lib/ids';
import { cleanOptions } from '../lib/options';
import { foodCategories } from './catalog';
import type {
  ActivityKind,
  AuditEntry,
  CheckoutInput,
  Issue,
  Locality,
  MenuCategory,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  ReporterRole,
  Rider,
  SelectedOption,
  Vendor,
  Zone,
  PromoCode,
} from './types';
import { SITE } from './site';
import { normalizePhone, phoneProblem, time12 } from '../lib/format';
import { tidyPromo } from '../lib/promo';
import { getCustomer, rememberPhone } from './customers';
import { notifyCustomer, notifyNewOrder, notifyOrderReady, type CustomerEvent } from './notify';
import { randomBytes } from 'node:crypto';
import { chargeMomo, initializePayment, MOMO_PROVIDERS, paystackEmail, paystackReady, refundPayment, submitChargeOtp, toPesewas, verifyPayment, webhookIsGenuine, type ChargeResult, type MomoNetwork } from '../lib/paystack';

export { tidyPromo };

const money2 = (n: number) => Math.round(n * 100) / 100;
/** For ILIKE searches: treat % and _ typed by people as normal characters */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// =====================================================================
// Zones
// Towns and localities rarely change but appear on every page, so the
// server keeps them for 30 seconds. Saving a town or locality clears it.
// =====================================================================
const ZONE_COLS = 'id, name, region, delivery_fee, is_active, lat, lng, radius_km';
const AREA_TTL = 30_000;
let areaCache: { at: number; zones: Promise<Zone[]>; localities: Promise<Locality[]> } | null = null;

function areas() {
  if (!areaCache || Date.now() - areaCache.at > AREA_TTL) {
    const zones = sql<Zone>(`select ${ZONE_COLS} from zones order by region, name`);
    const localities = sql<Locality>('select id, zone_id, name, is_active from localities order by name');
    areaCache = { at: Date.now(), zones, localities };
    // A failed load is not kept
    Promise.all([zones, localities]).catch(() => (areaCache = null));
  }
  return areaCache;
}
function clearAreas() {
  areaCache = null;
}

export async function getZones(): Promise<Zone[]> {
  return (await areas().zones).filter((z) => z.is_active).sort((a, b) => a.name.localeCompare(b.name));
}
export async function getAllZones(): Promise<Zone[]> {
  return [...(await areas().zones)];
}
/** A town customers can order in (switched-off towns are ignored). */
export async function getZone(id: number): Promise<Zone | undefined> {
  if (!Number.isInteger(id)) return undefined;
  return (await areas().zones).find((z) => z.id === id && z.is_active);
}
export async function saveZone(input: {
  id?: number;
  name: string;
  region: string;
  delivery_fee: number;
  is_active: boolean;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number;
}): Promise<void> {
  const name = input.name.trim();
  const region = input.region.trim();
  if (!name) throw new UserError('Enter the town name.');
  if (!region) throw new UserError('Enter the region, for example Central.');
  if (!(input.delivery_fee >= 0)) throw new UserError('Enter a delivery fee of 0 or more.');
  if (input.lat != null && !(input.lat >= 4 && input.lat <= 12)) throw new UserError('Latitude for Ghana is between 4 and 12.');
  if (input.lng != null && !(input.lng >= -4 && input.lng <= 2)) throw new UserError('Longitude for Ghana is between -4 and 2.');
  const clash = await sqlOne(`select id from zones where lower(name) = lower($1) and id <> coalesce($2::bigint, 0)`, [name, input.id ?? null]);
  if (clash) throw new UserError(`${name} already exists.`);

  if (input.id) {
    const done = await sqlOne(
      `update zones set name = $2, region = $3, delivery_fee = $4::numeric, is_active = $5::boolean,
         lat = case when $6::boolean then $7::double precision else lat end,
         lng = case when $6::boolean then $8::double precision else lng end,
         radius_km = coalesce($9::numeric, radius_km)
       where id = $1::bigint returning id`,
      [input.id, name, region, input.delivery_fee, input.is_active, input.lat !== undefined, input.lat ?? null, input.lng ?? null, input.radius_km || null],
    );
    if (!done) throw new UserError('Area not found.');
  } else {
    await sql(
      `insert into zones (name, region, delivery_fee, is_active, lat, lng, radius_km)
       values ($1, $2, $3::numeric, $4::boolean, $5::double precision, $6::double precision, coalesce($7::numeric, 5)) returning id`,
      [name, region, input.delivery_fee, input.is_active, input.lat ?? null, input.lng ?? null, input.radius_km || null],
    );
  }
  clearAreas();
}

// ---------- Localities (neighbourhoods inside a town) ----------
export async function getLocalities(opts: { zoneId?: number; all?: boolean } = {}): Promise<Locality[]> {
  const { zones, localities } = areas();
  const live = new Set((await zones).filter((z) => z.is_active).map((z) => z.id));
  return (await localities).filter(
    (l) => (opts.all || (l.is_active && live.has(l.zone_id))) && (opts.zoneId === undefined || l.zone_id === opts.zoneId),
  );
}
export async function getLocality(id: number | null | undefined): Promise<Locality | undefined> {
  if (!id || !Number.isInteger(id)) return undefined;
  return (await areas().localities).find((l) => l.id === id);
}
export async function saveLocality(input: { id?: number; zone_id: number; name: string; is_active: boolean }): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new UserError('Enter the locality name.');
  if (!(await sqlOne('select id from zones where id = $1::bigint', [input.zone_id]))) throw new UserError('Choose the town.');
  const clash = await sqlOne(
    'select id from localities where zone_id = $1::bigint and lower(name) = lower($2) and id <> coalesce($3::bigint, 0)',
    [input.zone_id, name, input.id ?? null],
  );
  if (clash) throw new UserError(`${name} is already listed in this town.`);
  if (input.id) {
    const done = await sqlOne('update localities set name = $2, is_active = $3::boolean where id = $1::bigint returning id', [input.id, name, input.is_active]);
    if (!done) throw new UserError('Locality not found.');
  } else {
    await sql('insert into localities (zone_id, name, is_active) values ($1::bigint, $2, $3::boolean) returning id', [input.zone_id, name, input.is_active]);
  }
  clearAreas();
}
/** A locality the customer typed because theirs isn't listed: one tidy line, kept short. */
export function tidyArea(value: unknown): string {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Localities customers typed in the last 90 days, most asked for first (to add to the list). */
export async function typedAreas(): Promise<{ zone_id: number; name: string; orders: number }[]> {
  return sql(
    `select zone_id, initcap(lower(locality_name)) as name, count(*)::int as orders
       from orders
      where locality_id is null and locality_name <> '' and created_at > now() - interval '90 days'
      group by zone_id, initcap(lower(locality_name))
      order by orders desc, name
      limit 30`,
  );
}

/** Checks a locality belongs to the town. Empty is allowed ("not listed"). */
export async function validLocality(zoneId: number, localityId: number | null): Promise<number | null> {
  if (!localityId) return null;
  const l = await sqlOne<{ id: number }>('select id from localities where id = $1::bigint and zone_id = $2::bigint', [localityId, zoneId]);
  if (!l) throw new UserError('Choose a locality in the selected town.');
  return l.id;
}

// =====================================================================
// Vendors and menus
// =====================================================================
/**
 * Open right now = the vendor's switch is on AND it's within their opening hours
 * (Ghana time). Hours that pass midnight (for example 6 pm to 2 am) work too.
 */
export const OPEN_NOW = `coalesce(v.is_open and v.opens_at is not null and case
    when v.opens_at <= v.closes_at then (now() at time zone 'Africa/Accra')::time >= v.opens_at and (now() at time zone 'Africa/Accra')::time < v.closes_at
    else (now() at time zone 'Africa/Accra')::time >= v.opens_at or (now() at time zone 'Africa/Accra')::time < v.closes_at
  end, false)`;

export const VENDOR_COLS = `v.id, v.owner_account_id, v.slug, v.name, v.description, v.cuisine_tags, v.address, v.zone_id, v.locality_id,
  v.phone, v.cover_url, v.prep_time_min, v.prep_time_max, v.min_order, v.delivery_fee, ${OPEN_NOW} as is_open, v.is_open as accepting,
  to_char(v.opens_at, 'HH24:MI') as opens_at, to_char(v.closes_at, 'HH24:MI') as closes_at,
  v.rating, v.rating_count, v.status, v.created_at, v.approved_at, v.business_type`;

export async function getVendors(): Promise<Vendor[]> {
  return sql<Vendor>(`select ${VENDOR_COLS} from vendors v where v.status = 'approved' order by ${OPEN_NOW} desc, v.rating desc, v.name`);
}
export async function getAllVendors(): Promise<Vendor[]> {
  return sql<Vendor>(`select ${VENDOR_COLS} from vendors v order by v.created_at desc`);
}
export async function getVendorBySlug(slug: string): Promise<Vendor | undefined> {
  return sqlOne<Vendor>(`select ${VENDOR_COLS} from vendors v where v.slug = $1 and v.status = 'approved'`, [slug]);
}
export async function getVendorById(id: string): Promise<Vendor | undefined> {
  if (!isUuid(id)) return undefined;
  return sqlOne<Vendor>(`select ${VENDOR_COLS} from vendors v where v.id = $1::uuid`, [id]);
}

export function vendorStatusLabel(v: Vendor): string {
  if (v.is_open) return `Open until ${time12(v.closes_at)}`;
  // Switched off by the vendor (not just outside hours)
  if (!v.accepting || !v.opens_at) return 'Closed for now';
  return `Opens at ${time12(v.opens_at)}`;
}

export async function setVendorOpen(vendorId: string, open: boolean): Promise<void> {
  const done =
    isUuid(vendorId) &&
    (await sqlOne<{ id: string; has_hours: boolean }>(
      // A store can't open before it has opening hours
      'update vendors set is_open = $2::boolean and opens_at is not null where id = $1::uuid returning id, opens_at is not null as has_hours',
      [vendorId, open],
    ));
  if (!done) throw new UserError('Store not found.');
  if (open && !done.has_hours) throw new UserError('Set your opening hours in Store settings first.');
}

export async function updateVendorSettings(
  vendorId: string,
  input: Pick<Vendor, 'name' | 'description' | 'phone' | 'address' | 'zone_id' | 'locality_id' | 'prep_time_min' | 'prep_time_max' | 'min_order'> & {
    opens_at: string;
    closes_at: string;
    /** Left out: the fee stays as it is */
    delivery_fee?: number;
    cuisine_tags: string[];
    cover_url?: string | null;
  },
): Promise<void> {
  if (!isUuid(vendorId)) throw new UserError('Store not found.');
  if (!input.name.trim()) throw new UserError('Enter your store name.');
  const phone = normalizePhone(input.phone);
  if (!phone) throw new UserError('Enter a valid Ghana phone number for the store.');
  if (!/^\d{2}:\d{2}$/.test(input.opens_at) || !/^\d{2}:\d{2}$/.test(input.closes_at)) throw new UserError('Enter opening and closing times.');
  if (input.opens_at === input.closes_at) throw new UserError('Opening and closing times can\'t be the same. For all day, use 12:00 am to 11:59 pm.');
  if (!(input.prep_time_min > 0 && input.prep_time_max >= input.prep_time_min)) throw new UserError('Check the preparation time range.');
  if (!(input.min_order >= 0)) throw new UserError('Minimum order must be 0 or more.');
  const fee = input.delivery_fee;
  if (fee !== undefined && !(fee >= 0 && fee <= 100)) throw new UserError('Set a delivery fee between GH₵ 0 and GH₵ 100.');
  const localityId = await validLocality(input.zone_id, input.locality_id);
  const done = await sqlOne(
    `update vendors set name = $2, description = $3, phone = $4, address = $5, zone_id = $6::bigint, locality_id = $7::bigint,
       opens_at = $8::time, closes_at = $9::time, prep_time_min = $10::int, prep_time_max = $11::int, min_order = $12::numeric,
       cuisine_tags = array(select jsonb_array_elements_text($13::jsonb)),
       cover_url = case when $14::boolean then $15 else cover_url end,
       delivery_fee = coalesce($16::numeric, delivery_fee)
     where id = $1::uuid returning id`,
    [
      vendorId,
      input.name.trim(),
      input.description.trim(),
      phone,
      input.address.trim(),
      input.zone_id,
      localityId,
      input.opens_at,
      input.closes_at,
      input.prep_time_min,
      input.prep_time_max,
      input.min_order,
      input.cuisine_tags.map((t) => t.trim()).filter(Boolean).slice(0, 6),
      input.cover_url !== undefined,
      input.cover_url ?? null,
      fee === undefined ? null : money2(fee),
    ],
  );
  if (!done) throw new UserError('Store not found.');
}

const ITEM_COLS = 'id, vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular';

export async function getMenu(vendorId: string): Promise<{ categories: MenuCategory[]; items: MenuItem[] }> {
  if (!isUuid(vendorId)) return { categories: [], items: [] };
  const [categories, items] = await Promise.all([
    sql<MenuCategory>('select id, vendor_id, name, sort_order from menu_categories where vendor_id = $1::uuid order by sort_order, id', [vendorId]),
    sql<MenuItem>(`select ${ITEM_COLS} from menu_items where vendor_id = $1::uuid order by sort_order, created_at`, [vendorId]),
  ]);
  return { categories, items };
}

export async function addCategory(vendorId: string, name: string): Promise<MenuCategory> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new UserError('Enter a section name.');
  if (!isUuid(vendorId)) throw new UserError('Store not found.');
  const existing = await sqlOne<MenuCategory>(
    'select id, vendor_id, name, sort_order from menu_categories where vendor_id = $1::uuid and lower(name) = lower($2)',
    [vendorId, clean],
  );
  if (existing) return existing;
  const cat = await sqlOne<MenuCategory>(
    `insert into menu_categories (vendor_id, name, sort_order)
     values ($1::uuid, $2, coalesce((select max(sort_order) from menu_categories where vendor_id = $1::uuid), 0) + 1)
     returning id, vendor_id, name, sort_order`,
    [vendorId, clean],
  );
  return cat!;
}

export async function saveMenuItem(
  vendorId: string,
  input: {
    id?: string;
    name: string;
    description: string;
    price: number;
    category_id: number | null;
    image_url?: string | null;
    is_available: boolean;
    is_popular: boolean;
    /** Choice groups. Leave out to keep the dish's current choices. */
    options?: unknown;
  },
): Promise<void> {
  if (!isUuid(vendorId)) throw new UserError('Store not found.');
  if (!input.name.trim()) throw new UserError('Enter the dish name.');
  const options = input.options === undefined ? undefined : cleanOptions(input.options);
  if (!(input.price > 0)) throw new UserError('Enter a price above GH₵ 0.');
  if (input.category_id !== null) {
    const ok = await sqlOne('select id from menu_categories where id = $1::bigint and vendor_id = $2::uuid', [input.category_id, vendorId]);
    if (!ok) throw new UserError('Choose a menu section.');
  }
  const common = [input.name.trim().slice(0, 80), input.description.trim().slice(0, 200), money2(input.price), input.category_id, input.is_available, input.is_popular];

  if (input.id) {
    if (!isUuid(input.id)) throw new UserError('Dish not found.');
    const done = await sqlOne(
      `update menu_items set name = $3, description = $4, price = $5::numeric, category_id = $6::bigint, is_available = $7::boolean, is_popular = $8::boolean,
         image_url = case when $9::boolean then $10 else image_url end,
         options = case when $11::boolean then $12::jsonb else options end
       where id = $1::uuid and vendor_id = $2::uuid returning id`,
      [input.id, vendorId, ...common, input.image_url !== undefined, input.image_url ?? null, options !== undefined, options ?? []],
    );
    if (!done) throw new UserError('Dish not found.');
  } else {
    await sql(
      `insert into menu_items (vendor_id, name, description, price, category_id, is_available, is_popular, image_url, options)
       values ($1::uuid, $2, $3, $4::numeric, $5::bigint, $6::boolean, $7::boolean, $8, $9::jsonb) returning id`,
      [vendorId, ...common, input.image_url ?? null, options ?? []],
    );
  }
}

export async function setItemAvailable(vendorId: string, itemId: string, available: boolean): Promise<void> {
  const done =
    isUuid(itemId) &&
    isUuid(vendorId) &&
    (await sqlOne('update menu_items set is_available = $3::boolean where id = $1::uuid and vendor_id = $2::uuid returning id', [itemId, vendorId, available]));
  if (!done) throw new UserError('Dish not found.');
}

export async function deleteMenuItem(vendorId: string, itemId: string): Promise<void> {
  const done =
    isUuid(itemId) && isUuid(vendorId) && (await sqlOne('delete from menu_items where id = $1::uuid and vendor_id = $2::uuid returning id', [itemId, vendorId]));
  if (!done) throw new UserError('Dish not found.');
}

/** Dishes by id (for favourites), only from live restaurants. */
export async function getItemsByIds(ids: string[]): Promise<(MenuItem & { vendor_name: string; vendor_slug: string })[]> {
  const clean = ids.filter(isUuid).slice(0, 200);
  if (!clean.length) return [];
  return sql(
    `select ${ITEM_COLS.split(', ').map((c) => `i.${c}`).join(', ')}, v.name as vendor_name, v.slug as vendor_slug
     from menu_items i join vendors v on v.id = i.vendor_id
     where v.status = 'approved' and i.id in (select jsonb_array_elements_text($1::jsonb)::uuid)`,
    [clean],
  );
}

export type HomeDish = MenuItem & { vendor_name: string; vendor_slug: string; vendor_open: boolean; section: string; sold: number };

/**
 * Dishes for the home page rows, from live restaurants in one town: how many
 * were ordered in the last 30 days (for "Most ordered") and the menu section
 * they sit in (to find fufu, banku...). Open restaurants first.
 */
export async function getHomeDishes(zoneId: number): Promise<HomeDish[]> {
  return sql<HomeDish>(
    `select ${ITEM_COLS.split(', ').map((c) => `i.${c}`).join(', ')}, v.name as vendor_name, v.slug as vendor_slug,
       ${OPEN_NOW} as vendor_open, coalesce(c.name, '') as section,
       coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id
         where oi.menu_item_id = i.id and o.status <> 'cancelled' and o.created_at > now() - interval '30 days'), 0)::int as sold
     from menu_items i join vendors v on v.id = i.vendor_id left join menu_categories c on c.id = i.category_id
     where v.status = 'approved' and v.zone_id = $1::bigint and i.is_available
     order by ${OPEN_NOW} desc, i.is_popular desc, i.name limit 400`,
    [zoneId],
  );
}

export function getFoodCategories(): string[] {
  return foodCategories;
}

/** With a town, only restaurants in that town (they deliver in their own town). */
export async function search(q: string, category: string, zoneId?: number | null): Promise<{ vendors: Vendor[]; items: (MenuItem & { vendor: Vendor })[] }> {
  const term = (q || category).trim().slice(0, 60);
  if (!term) return { vendors: [], items: [] };
  const pattern = `%${likeEscape(term)}%`;
  const [vendors, items] = await Promise.all([
    sql<Vendor>(
      `select ${VENDOR_COLS} from vendors v where v.status = 'approved'
         and ($2::bigint is null or v.zone_id = $2::bigint)
         and (v.name ilike $1 or v.description ilike $1 or exists (select 1 from unnest(v.cuisine_tags) t where t ilike $1))
       order by ${OPEN_NOW} desc, v.rating desc limit 30`,
      [pattern, zoneId || null],
    ),
    sql<MenuItem & { vendor: Vendor }>(
      `select ${ITEM_COLS.split(', ').map((c) => `i.${c}`).join(', ')},
         (select to_jsonb(x) from (select ${VENDOR_COLS} from vendors v where v.id = i.vendor_id) x) as vendor
       from menu_items i join vendors v on v.id = i.vendor_id
       where v.status = 'approved' and ($2::bigint is null or v.zone_id = $2::bigint) and (i.name ilike $1 or i.description ilike $1)
       order by ${OPEN_NOW} desc, i.is_popular desc, i.name limit 60`,
      [pattern, zoneId || null],
    ),
  ]);
  return { vendors, items };
}

export type Suggestion = {
  dishes: { id: string; name: string; price: number; image_url: string | null; vendor_name: string; vendor_slug: string; open: boolean }[];
  places: { name: string; slug: string; cover_url: string | null; open: boolean }[];
};

/** Quick matches while someone types in Search: a few dishes and places, best first. */
export async function searchSuggestions(q: string, zoneId?: number | null): Promise<Suggestion> {
  const term = q.trim().slice(0, 60);
  if (term.length < 1) return { dishes: [], places: [] };
  const any = `%${likeEscape(term)}%`;
  const starts = `${likeEscape(term)}%`;
  const wordStarts = `% ${likeEscape(term)}%`;
  const [dishes, places] = await Promise.all([
    sql<Suggestion['dishes'][number]>(
      `select i.id, i.name, i.price::float as price, i.image_url, v.name as vendor_name, v.slug as vendor_slug, ${OPEN_NOW} as open
       from menu_items i join vendors v on v.id = i.vendor_id
       where v.status = 'approved' and i.is_available and ($4::bigint is null or v.zone_id = $4::bigint) and i.name ilike $1
       order by (i.name ilike $2) desc, (i.name ilike $3) desc, ${OPEN_NOW} desc, i.is_popular desc, i.name
       limit 6`,
      [any, starts, wordStarts, zoneId || null],
    ),
    sql<Suggestion['places'][number]>(
      `select v.name, v.slug, v.cover_url, ${OPEN_NOW} as open from vendors v
       where v.status = 'approved' and ($4::bigint is null or v.zone_id = $4::bigint)
         and (v.name ilike $1 or exists (select 1 from unnest(v.cuisine_tags) t where t ilike $1))
       order by (v.name ilike $2) desc, (v.name ilike $3) desc, ${OPEN_NOW} desc, v.rating desc
       limit 4`,
      [any, starts, wordStarts, zoneId || null],
    ),
  ]);
  return { dishes, places };
}

// =====================================================================
// Pricing (the server is the source of truth)
// =====================================================================
export function priceItem(item: MenuItem, chosen: { group: string; choice: string }[]): { unitPrice: number; options: SelectedOption[] } {
  const selected: SelectedOption[] = [];
  for (const group of item.options) {
    const picks = chosen.filter((c) => c.group === group.name);
    if (group.required && picks.length === 0) throw new UserError(`Choose an option for "${group.name}" on ${item.name}.`);
    if (picks.length > group.max) throw new UserError(`Too many choices for "${group.name}" on ${item.name}.`);
    for (const pick of picks) {
      const choice = group.choices.find((c) => c.name === pick.choice);
      if (!choice) throw new UserError(`"${pick.choice}" is no longer available for ${item.name}.`);
      selected.push({ group: group.name, choice: choice.name, price: choice.price });
    }
  }
  const unitPrice = money2(item.price + selected.reduce((sum, o) => sum + o.price, 0));
  return { unitPrice, options: selected };
}

// =====================================================================
// Orders
// =====================================================================
const ORDER_SELECT = `select o.id, o.code, o.vendor_id, o.vendor_name, o.vendor_slug, o.vendor_phone, o.vendor_address,
  o.rider_id, o.rider_name, o.rider_phone, o.rider_assigned_at,
  (select r.photo_url from riders r where r.id = o.rider_id) as rider_photo,
  (select r.plate_number from riders r where r.id = o.rider_id) as rider_plate, o.status, o.payment_method, o.payment_status,
  o.subtotal, o.delivery_fee, o.promo_code, o.discount, o.total, o.zone_id, o.zone_name, o.locality_name, o.delivery_landmark, o.delivery_address,
  o.customer_phone, o.customer_id, o.note, o.cancel_reason, o.paystack_reference, o.delivery_code, o.delivery_code_attempts, o.rating, o.created_at,
  coalesce((select jsonb_agg(jsonb_build_object('menu_item_id', i.menu_item_id, 'name', i.name, 'unit_price', i.unit_price,
      'quantity', i.quantity, 'options', i.options, 'line_total', i.line_total) order by i.id)
    from order_items i where i.order_id = o.id), '[]'::jsonb) as items,
  coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('status', e.status, 'at', e.at, 'note', e.note, 'by', e.by_name)) order by e.at, e.id)
    from order_events e where e.order_id = o.id), '[]'::jsonb) as events
  from orders o`;

// In progress for the kitchen, riders and admins (an order waiting for payment isn't, yet)
const ACTIVE = `o.status not in ('pending_payment', 'delivered', 'cancelled')`;
// Orders the kitchen actually received: cash, or paid online (refunded ones were paid, then cancelled)
const REACHED_KITCHEN = `(o.payment_method = 'cash' or o.payment_status in ('paid', 'refunded'))`;

async function findOrder(code: string): Promise<Order> {
  const o = await getOrderByCode(code);
  if (!o) throw new UserError('Order not found.');
  return o;
}

/**
 * Moves an order to a new status in one step, only if it's still in one of
 * the allowed statuses, and writes the timeline entries. Returns false if
 * nothing changed (someone else got there first, or the status was wrong).
 */
async function transition(opts: {
  code: string;
  from: OrderStatus[];
  to: OrderStatus;
  events?: OrderStatus[];
  note?: string | null;
  by?: string | null;
  set?: string; // extra "column = value" pairs, may use $7 onwards
  where?: string; // extra conditions, may use $7 onwards
  params?: unknown[];
}): Promise<boolean> {
  const row = await sqlOne(
    `with u as (
       update orders o set status = $2::order_status${opts.set ? `, ${opts.set}` : ''}
       where upper(o.code) = upper($1) and o.status in (select jsonb_array_elements_text($3::jsonb)::order_status)${opts.where ? ` and ${opts.where}` : ''}
       returning o.id, o.code
     ), e as (
       insert into order_events (order_id, status, note, by_name)
       select u.id, s.st::order_status, $4, $5 from u, jsonb_array_elements_text($6::jsonb) with ordinality as s(st, n) order by s.n
       returning 1
     )
     select code from u`,
    [opts.code, opts.to, opts.from, opts.note ?? null, opts.by ?? null, opts.events ?? [opts.to], ...(opts.params ?? [])],
  );
  return !!row;
}

const REFUND = `payment_status = case when payment_status = 'paid' and payment_method <> 'cash' then 'refunded'::payment_status else payment_status end`;

export async function getOrders(filter: { status?: OrderStatus | 'active' } = {}): Promise<Order[]> {
  if (filter.status === 'active') return sql<Order>(`${ORDER_SELECT} where ${ACTIVE} order by o.created_at desc limit 500`);
  if (filter.status) return sql<Order>(`${ORDER_SELECT} where o.status = $1::order_status order by o.created_at desc limit 500`, [filter.status]);
  return sql<Order>(`${ORDER_SELECT} order by o.created_at desc limit 500`);
}

/** How many orders each vendor or rider has delivered, counted in the database. */
export async function deliveredCounts(by: 'vendor' | 'rider'): Promise<Map<string, number>> {
  const col = by === 'vendor' ? 'vendor_id' : 'rider_id';
  const rows = await sql<{ id: string; n: number }>(
    `select ${col} as id, count(*)::int as n from orders where status = 'delivered' and ${col} is not null group by ${col}`,
  );
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

/** Orders for the signed-in phone number plus any placed from this browser. */
/** A customer's orders: those on their account, plus any placed on this device. */
export async function getCustomerOrders(customerId: string | null, codes: string[]): Promise<Order[]> {
  if (!customerId && !codes.length) return [];
  return sql<Order>(
    `${ORDER_SELECT} where o.customer_id = $1::uuid or o.code in (select jsonb_array_elements_text($2::jsonb)) order by o.created_at desc limit 100`,
    [customerId, codes.slice(0, 30)],
  );
}

export async function getOrderByCode(code: string): Promise<Order | undefined> {
  if (!/^RB-\d{1,9}$/i.test(code.trim())) return undefined;
  return sqlOne<Order>(`${ORDER_SELECT} where upper(o.code) = upper($1)`, [code.trim()]);
}

// ---------- Promo codes ----------
// Each promoter gets their own code. It takes money off a customer's first
// order only; Relax&Bite pays the discount, the restaurant gets its full food total.

const FIRST_ORDER_ONLY = "Promo codes are for your first order, and you've ordered with this account or phone number before.";

/** Checks a code someone typed. With an account and/or phone number, also checks it's their first order. */
export async function checkPromo(raw: unknown, who: { phone?: string | null; customerId?: string | null } = {}): Promise<{ code: string; discount: number }> {
  const code = tidyPromo(raw);
  if (!code) throw new UserError('Enter a promo code.');
  const promo = await sqlOne<{ code: string; discount: number }>('select code, discount from promo_codes where code = $1 and is_active', [code]);
  if (!promo) throw new UserError(`${code} isn't a valid promo code. Check the spelling and try again.`);
  if (who.phone || who.customerId) {
    const before = await sqlOne(
      `select 1 as x from orders where status <> 'cancelled' and (customer_phone = $1 or customer_id = $2::uuid) limit 1`,
      [who.phone ?? null, who.customerId ?? null],
    );
    if (before) throw new UserError(FIRST_ORDER_ONLY);
  }
  return { code: promo.code, discount: Number(promo.discount) };
}

export async function listPromos(): Promise<PromoCode[]> {
  return sql<PromoCode>(
    `select p.id, p.code, p.promoter_name, p.promoter_phone, p.discount, p.is_active, p.created_by, p.created_at,
       count(o.id) filter (where o.status <> 'cancelled') as uses,
       count(o.id) filter (where o.status = 'delivered') as delivered,
       coalesce(sum(o.discount) filter (where o.status = 'delivered'), 0) as given,
       max(o.created_at) filter (where o.status <> 'cancelled') as last_used
     from promo_codes p left join orders o on o.promo_code = p.code
     group by p.id
     order by p.is_active desc, p.created_at desc`,
  );
}

export async function createPromo(input: { promoterName: string; promoterPhone: string; code: string; discount: number; by: string }): Promise<PromoCode> {
  const name = input.promoterName.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (name.length < 2) throw new UserError("Enter the promoter's name.");
  let phone: string | null = null;
  if (input.promoterPhone.trim()) {
    phone = normalizePhone(input.promoterPhone);
    if (!phone) throw new UserError("Enter a valid Ghana phone number for the promoter, or leave it empty.");
  }
  const discount = money2(Number(input.discount));
  if (!(discount >= 1 && discount <= 200)) throw new UserError('Enter a discount between GH₵ 1 and GH₵ 200.');

  const taken = async (c: string) => Boolean(await sqlOne('select 1 as x from promo_codes where code = $1', [c]));
  let code = tidyPromo(input.code);
  if (code) {
    if (code.length < 3) throw new UserError('A promo code needs at least 3 letters or numbers.');
    if (await taken(code)) throw new UserError(`${code} is already taken. Try another code.`);
  } else {
    // Their first name and the amount, like KOFI10; KOFI10B, KOFI10C... if that's taken
    const first = (name.split(' ')[0] ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10);
    const base = `${first.length >= 2 ? first : 'RB'}${Math.round(discount)}`;
    code = base;
    for (let n = 0; (await taken(code)) && n < 26; n++) code = `${base}${String.fromCharCode(66 + n)}`;
    if (await taken(code)) throw new UserError('Type a code for this promoter.');
  }

  await sqlOne(
    `insert into promo_codes (code, promoter_name, promoter_phone, discount, created_by) values ($1, $2, $3, $4::numeric, $5) returning id`,
    [code, name, phone, discount, input.by.slice(0, 80)],
  );
  return (await listPromos()).find((p) => p.code === code)!;
}

export async function setPromoActive(id: number, active: boolean): Promise<string> {
  const row = await sqlOne<{ code: string }>('update promo_codes set is_active = $2::boolean where id = $1::bigint returning code', [id, active]);
  if (!row) throw new UserError('That promo code could not be found.');
  return row.code;
}

export async function createOrder(input: CheckoutInput): Promise<Order> {
  const vendor = await getVendorById(input.vendorId);
  if (!vendor || vendor.status !== 'approved') throw new UserError('This restaurant could not be found.');
  if (!vendor.is_open) throw new UserError(`${vendor.name} is closed right now. ${vendorStatusLabel(vendor)}.`);

  const zone = await getZone(input.zoneId);
  if (!zone) throw new UserError('Choose your town.');
  // Restaurants deliver in their own town
  if (vendor.zone_id !== zone.id) {
    const home = await getZone(vendor.zone_id);
    throw new UserError(`${vendor.name} only delivers in ${home?.name ?? 'its own town'}. Change your delivery town, or order from a restaurant in ${zone.name}.`);
  }
  // Localities are no longer used: the town and the landmark are enough
  const area = tidyArea(input.area);

  // Only signed-in customers can order (email code or Google)
  const customer = input.customerId ? await getCustomer(input.customerId) : undefined;
  if (!customer) throw new UserError('Sign in to place an order.');
  const phone = normalizePhone(input.phone);
  if (!phone) throw new UserError('Enter a valid Ghana phone number, for example 024 123 4567.');
  if (!input.landmark.trim()) throw new UserError('Add a landmark so the rider can find you.');
  if (!['momo', 'card', 'cash'].includes(input.paymentMethod)) throw new UserError('Choose a payment method.');
  if (!input.lines.length) throw new UserError('Your cart is empty.');
  if (input.lines.length > 40) throw new UserError('Your cart has too many lines. Split it into two orders.');

  const { items: menu } = await getMenu(vendor.id);
  const items: OrderItem[] = input.lines.map((line) => {
    const item = menu.find((i) => i.id === line.itemId);
    if (!item) throw new UserError('An item in your cart is no longer on the menu. Remove it and try again.');
    if (!item.is_available) throw new UserError(`${item.name} is sold out. Remove it from your cart to continue.`);
    const qty = Math.floor(Number(line.qty));
    if (!(qty >= 1 && qty <= 50)) throw new UserError(`Check the quantity for ${item.name}.`);
    const { unitPrice, options } = priceItem(item, line.options ?? []);
    return { menu_item_id: item.id, name: item.name, unit_price: unitPrice, quantity: qty, options, line_total: money2(unitPrice * qty) };
  });

  const subtotal = money2(items.reduce((s, i) => s + i.line_total, 0));
  if (subtotal < vendor.min_order) throw new UserError(`${vendor.name} has a minimum order of GH₵ ${Number(vendor.min_order).toFixed(2)}.`);
  // Each restaurant sets its own delivery fee (the rider earns it)
  const fee = money2(vendor.delivery_fee);

  // Promo code: first order only, for this account and this phone number
  let promo: { code: string; discount: number } | null = null;
  if (tidyPromo(input.promoCode)) promo = await checkPromo(input.promoCode, { phone, customerId: customer.id });
  const discount = promo ? money2(Math.min(promo.discount, subtotal)) : 0;
  const total = money2(subtotal + fee - discount);

  // With Paystack connected, an online order waits for payment before the kitchen sees it.
  // Without it (testing), it's marked paid straight away.
  const online = input.paymentMethod !== 'cash';
  const waitForPayment = online && paystackReady();
  const startStatus: OrderStatus = waitForPayment ? 'pending_payment' : 'placed';
  if (waitForPayment) await expireUnpaid();

  // Cash on delivery protects vendors and riders from fake orders: only up to a limit
  if (input.paymentMethod === 'cash') {
    // Switched off: every order is paid in the app, so restaurant and rider wallets are always right
    if (!SITE.cashOnDelivery) throw new UserError("Cash on delivery isn't available. Pay with Mobile Money or card.");
    if (total > SITE.cashLimit) {
      throw new UserError(`Cash on delivery is available for orders up to GH₵ ${SITE.cashLimit}. Pay with Mobile Money or card for bigger orders.`);
    }
    const blocked = await sqlOne<{ cash_blocked: boolean }>('select cash_blocked from customers where phone = $1', [phone]);
    if (blocked?.cash_blocked) throw new UserError('Cash on delivery is not available on this number. Pay with Mobile Money or card.');
  }

  // Order, its lines and the first timeline entry are saved together, or not at all
  let created: { code: string } | undefined;
  try {
    created = await sqlOne<{ code: string }>(
      `with o as (
         insert into orders (vendor_id, vendor_name, vendor_slug, vendor_phone, vendor_address, status, payment_method, payment_status,
           subtotal, delivery_fee, total, commission_rate, zone_id, zone_name, locality_id, locality_name,
           delivery_landmark, delivery_address, customer_phone, note, promo_code, discount, customer_id)
         select $1::uuid, $2, $3, $4, $5, $23::order_status, $6::payment_method, $7::payment_status,
           $8::numeric, $9::numeric, $10::numeric, $11::numeric, $12::bigint, $13, $14::bigint, $15, $16, $17, $18, $19, $21, $22::numeric, $24::uuid
         -- A promo order only goes in if this account and number have no other order
         where $22::numeric = 0 or not exists (
           select 1 from orders x where (x.customer_phone = $18 or x.customer_id = $24::uuid) and x.status <> 'cancelled')
         returning id, code
       ), lines as (
         insert into order_items (order_id, menu_item_id, name, unit_price, quantity, options, line_total)
         select o.id, x.menu_item_id, x.name, x.unit_price, x.quantity, coalesce(x.options, '[]'::jsonb), x.line_total
         from o, jsonb_to_recordset($20::jsonb) as x(menu_item_id uuid, name text, unit_price numeric, quantity int, options jsonb, line_total numeric)
         returning 1
       ), ev as (
         insert into order_events (order_id, status) select id, $23::order_status from o returning 1
       )
       select code from o`,
      [
        vendor.id,
        vendor.name,
        vendor.slug,
        vendor.phone,
        vendor.address,
        input.paymentMethod,
        online && !waitForPayment ? 'paid' : 'unpaid',
        subtotal,
        fee,
        total,
        0, // Relax&Bite's 10% now comes off when the restaurant withdraws (see data/wallet.ts)
        zone.id,
        zone.name,
        null, // locality (no longer used)
        area,
        input.landmark.trim().slice(0, 120),
        input.details.trim().slice(0, 120),
        phone,
        input.note.trim().slice(0, 300),
        items,
        promo?.code ?? null,
        discount,
        startStatus,
        customer.id,
      ],
    );
  } catch (e) {
    // Two promo orders from one number at the same moment: the database lets only one in
    if (discount > 0 && e instanceof UserError && e.message === 'That already exists.') throw new UserError(FIRST_ORDER_ONLY);
    throw e;
  }
  if (!created) throw new UserError(FIRST_ORDER_ONLY);
  // Filled in for them next time
  await rememberPhone(customer.id, phone);
  const order = await findOrder(created.code);
  // The kitchen (and nearby riders) hear about it now; online orders wait until they're paid
  if (order.status === 'placed') await notifyNewOrder(order);
  return order;
}


// ---------- Paying online (Paystack) ----------
// How long an order can wait for payment before it's cancelled
const PAY_WITHIN_MINUTES = 30;

/** Cancels orders that were never paid for. Cheap, so it runs whenever it matters. */
export async function expireUnpaid(): Promise<void> {
  await sql(
    `with u as (
       update orders set status = 'cancelled', cancel_reason = 'Payment not completed'
       where status = 'pending_payment' and created_at < now() - make_interval(mins => $1::int)
       returning id
     ), e as (
       insert into order_events (order_id, status, note) select id, 'cancelled', 'Payment not completed' from u returning 1
     )
     select count(*)::int as n from u`,
    [PAY_WITHIN_MINUTES],
  );
}

/** A new payment try for an order (Paystack never reuses a reference). */
async function newPaymentAttempt(o: Order): Promise<string> {
  const reference = `${o.code}-${randomBytes(4).toString('hex')}`;
  await sqlOne(
    `with p as (
       insert into order_payments (reference, order_id, amount) values ($1, $2::uuid, $3::numeric) returning reference
     )
     update orders set paystack_reference = (select reference from p), payment_status = 'unpaid'
     where id = $2::uuid and status = 'pending_payment' returning id`,
    [reference, o.id, o.total],
  );
  return reference;
}

async function payableOrder(code: string): Promise<Order> {
  await expireUnpaid();
  const o = await findOrder(code);
  if (o.status === 'cancelled') throw new UserError("This order was cancelled because it wasn't paid for in time. Add the food to your cart and order again.");
  if (o.status !== 'pending_payment') throw new UserError('This order is already paid.');
  return o;
}

// ---------- Mobile Money inside the app ----------
export type MomoState = { state: 'approve' | 'otp' | 'paid' | 'failed'; message: string };

async function momoOutcome(code: string, reference: string, r: ChargeResult): Promise<MomoState> {
  if (r.status === 'success') {
    const c = await confirmPayment(reference);
    return c.outcome === 'paid' ? { state: 'paid', message: '' } : c.outcome === 'waiting' ? { state: 'approve', message: '' } : { state: 'failed', message: c.message ?? "The payment didn't go through." };
  }
  if (r.status === 'send_otp') return { state: 'otp', message: r.displayText || 'Enter the code sent to your phone by SMS.' };
  if (r.status === 'failed') {
    await sql(`update order_payments set status = 'failed' where reference = $1 and status = 'started' returning reference`, [reference]);
    return { state: 'failed', message: r.gatewayResponse || r.displayText || "The prompt couldn't be sent. Check the number and network, then try again." };
  }
  // pay_offline, pending, ongoing: the prompt is on its way
  return { state: 'approve', message: r.displayText || 'Approve the prompt on your phone.' };
}

/** Sends a Mobile Money prompt to the customer's phone for this order. */
export async function startMomoCharge(code: string, rawPhone: string, network: string): Promise<MomoState> {
  const o = await payableOrder(code);
  if (o.payment_method !== 'momo') throw new UserError('This order is paid by card.');
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new UserError(phoneProblem(rawPhone) ?? 'Enter your Mobile Money number.');
  if (!(network in MOMO_PROVIDERS)) throw new UserError('Choose your Mobile Money network.');
  const reference = await newPaymentAttempt(o);
  const r = await chargeMomo({
    email: paystackEmail(o.customer_phone, SITE.supportEmail),
    amount: o.total,
    reference,
    phone,
    network: network as MomoNetwork,
    metadata: { order: o.code, restaurant: o.vendor_name },
  });
  return momoOutcome(o.code, reference, r);
}

/** The code the network sent by SMS (some Telecel payments ask for one). */
export async function submitMomoOtp(code: string, otp: string): Promise<MomoState> {
  const o = await payableOrder(code);
  const clean = otp.replace(/\s/g, '').slice(0, 12);
  if (!/^\w{3,12}$/.test(clean)) throw new UserError('Enter the code from the SMS.');
  if (!o.paystack_reference) throw new UserError('Send the prompt again.');
  return momoOutcome(o.code, o.paystack_reference, await submitChargeOtp(o.paystack_reference, clean));
}

/** Has the Mobile Money payment come through yet? */
export async function momoStatus(code: string): Promise<MomoState> {
  const o = await findOrder(code);
  if (o.status !== 'pending_payment') {
    return o.payment_status === 'paid' ? { state: 'paid', message: '' } : { state: 'failed', message: o.cancel_reason || 'This order can no longer be paid.' };
  }
  if (!o.paystack_reference) return { state: 'failed', message: 'Send the prompt again.' };
  const c = await confirmPayment(o.paystack_reference);
  if (c.outcome === 'paid') return { state: 'paid', message: '' };
  if (c.outcome === 'waiting') return { state: 'approve', message: '' };
  return { state: 'failed', message: c.message ?? "The payment didn't go through. Try again." };
}

/** Starts (or retries) paying for an order. Returns Paystack's payment page to send the customer to. */
export async function startPayment(code: string, origin: string): Promise<string> {
  const o = await payableOrder(code);
  if (o.payment_method === 'cash') throw new UserError('This order is paid in cash when it arrives.');
  const reference = await newPaymentAttempt(o);
  return initializePayment({
    email: paystackEmail(o.customer_phone, SITE.supportEmail),
    amount: o.total,
    reference,
    callbackUrl: `${origin.replace(/\/+$/, '')}/pay/return`,
    method: o.payment_method === 'card' ? 'card' : 'momo',
    metadata: {
      order: o.code,
      custom_fields: [
        { display_name: 'Order', variable_name: 'order', value: o.code },
        { display_name: 'Restaurant', variable_name: 'restaurant', value: o.vendor_name },
        { display_name: 'Phone', variable_name: 'phone', value: o.customer_phone },
      ],
    },
  });
}

export type PaymentOutcome = 'paid' | 'failed' | 'waiting' | 'refunded';

/**
 * Finds out from Paystack what happened to a payment and updates the order.
 * Called when the customer comes back from Paystack and when Paystack's
 * webhook arrives; whichever is first does the work, the other changes nothing.
 */
export async function confirmPayment(reference: string): Promise<{ order: Order; outcome: PaymentOutcome; message?: string }> {
  const pay = await sqlOne<{ code: string; amount: number; status: string; current: boolean }>(
    `select o.code, p.amount, p.status, coalesce(o.paystack_reference = p.reference, false) as current
     from order_payments p join orders o on o.id = p.order_id where p.reference = $1`,
    [String(reference).slice(0, 80)],
  );
  if (!pay) throw new UserError('That payment could not be found.');
  const order = await findOrder(pay.code);
  const state = async (outcome: PaymentOutcome, message?: string) => ({ order: await findOrder(pay.code), outcome, message });

  if (pay.status === 'success') return state(order.payment_status === 'refunded' ? 'refunded' : 'paid');
  if (pay.status === 'refunded') return state('refunded', 'This payment was refunded.');

  const v = await verifyPayment(reference);

  if (v.status === 'success') {
    // The amount must be exactly what the order cost, in cedis
    if (v.currency !== 'GHS' || v.amount !== toPesewas(Number(pay.amount)) || v.amount !== toPesewas(order.total)) {
      if (await claimRefund(reference)) {
        await audit('Paystack', `Payment ${reference} for ${order.code} was ${v.currency} ${(v.amount / 100).toFixed(2)}, but the order is GH₵ ${order.total.toFixed(2)}. Not accepted, refunding it.`, { kind: 'order', severity: 'warning' });
        await sendRefund(reference, order.code, 'Amount did not match the order');
      }
      await sql(`update orders set payment_status = 'failed' where id = $1::uuid and status = 'pending_payment' returning id`, [order.id]);
      return state('failed', "The amount paid didn't match your order, so it's being refunded. Please try again.");
    }

    await sql(`update order_payments set status = 'success' where reference = $1 and status = 'started' returning reference`, [reference]);
    // Any successful payment of the right amount pays the order (the first one to arrive)
    const placed = await transition({
      code: order.code,
      from: ['pending_payment'],
      to: 'placed',
      note: v.channel === 'card' ? 'Paid with card' : 'Paid with Mobile Money',
      set: `payment_status = 'paid', paystack_reference = $7`,
      params: [reference],
    });
    if (placed) {
      await notifyNewOrder(await findOrder(order.code));
      return state('paid');
    }

    const now = await findOrder(pay.code);
    if (now.paystack_reference === reference && now.payment_status === 'paid') return state('paid'); // the other caller got there first
    // Paid for an order that was cancelled, or paid a second time: give it back
    if (await claimRefund(reference, 'success')) {
      if (now.status === 'cancelled' && now.payment_status !== 'paid') {
        await sql(`update orders set payment_status = 'refunded' where id = $1::uuid returning id`, [now.id]);
      }
      await audit('Paystack', `Refunding ${reference}: ${now.status === 'cancelled' ? `${now.code} was already cancelled` : `${now.code} was already paid`}.`, { kind: 'order', severity: 'warning' });
      await sendRefund(reference, now.code, now.status === 'cancelled' ? 'Order already cancelled' : 'Paid twice');
    }
    return state(
      'refunded',
      now.status === 'cancelled'
        ? 'This order was cancelled before your payment came through, so your money is being refunded.'
        : "This order was already paid, so this second payment is being refunded.",
    );
  }

  if (v.status === 'failed' || v.status === 'abandoned' || v.status === 'reversed') {
    await sql(`update order_payments set status = 'failed' where reference = $1 and status = 'started' returning reference`, [reference]);
    if (pay.current) await sql(`update orders set payment_status = 'failed' where id = $1::uuid and status = 'pending_payment' and payment_status = 'unpaid' returning id`, [order.id]);
    const why = v.status === 'abandoned' ? "The payment wasn't finished." : v.gatewayResponse && !/^(declined|failed)$/i.test(v.gatewayResponse) ? `The payment didn't go through: ${v.gatewayResponse}.` : "The payment didn't go through.";
    return state('failed', `${why} You can try again.`);
  }

  // Still going on (for example, the Mobile Money prompt hasn't been approved yet)
  return state('waiting');
}

/** A message from Paystack's webhook. Returns what was done with it. */
export async function handlePaystackEvent(raw: string, signature: string | null): Promise<'rejected' | 'ignored' | PaymentOutcome> {
  if (!webhookIsGenuine(raw, signature)) return 'rejected';
  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return 'ignored';
  }
  const reference = event.data?.reference;
  if (!reference || !['charge.success', 'charge.failed'].includes(event.event ?? '')) return 'ignored';
  try {
    return (await confirmPayment(reference)).outcome;
  } catch (e) {
    if (e instanceof UserError) return 'ignored'; // not one of ours
    throw e; // Paystack tries again later
  }
}

/** Marks a payment as being refunded. Only one caller wins, so money is never refunded twice. */
async function claimRefund(reference: string, from: 'started' | 'success' | 'any' = 'any'): Promise<boolean> {
  const allowed = from === 'any' ? `status in ('started', 'success')` : `status = '${from}'`;
  return Boolean(await sqlOne(`update order_payments set status = 'refunded' where reference = $1 and ${allowed} returning reference`, [reference]));
}

async function sendRefund(reference: string, code: string, reason: string): Promise<void> {
  try {
    await refundPayment(reference, `${code}: ${reason}`);
  } catch (e) {
    await audit('Paystack', `Refund for ${code} (${reference}) failed: ${(e as Error).message}. Refund it in the Paystack dashboard.`, { kind: 'order', severity: 'danger' });
  }
}

/** After an order paid online is cancelled: send the money back through Paystack. */
async function refundOnline(code: string, reason: string): Promise<void> {
  if (!paystackReady()) return; // testing without Paystack: nothing was really paid
  const o = await getOrderByCode(code);
  if (!o || o.payment_method === 'cash') return;
  const paid = await sql<{ reference: string }>(`select reference from order_payments where order_id = $1::uuid and status = 'success'`, [o.id]);
  for (const p of paid) {
    if (await claimRefund(p.reference, 'success')) await sendRefund(p.reference, o.code, reason);
  }
}

/** Tells the customer about their order (never holds anything up). */
async function tellCustomer(code: string, event: CustomerEvent): Promise<void> {
  try {
    await notifyCustomer(await findOrder(code), event);
  } catch (e) {
    console.error(`[notify] customer ${code}: skipped:`, (e as Error).message);
  }
}

// ---------- Customer actions ----------
export async function cancelOrder(code: string): Promise<void> {
  const ok = await transition({ code, from: ['pending_payment', 'placed'], to: 'cancelled', note: 'Cancelled by customer', set: `cancel_reason = 'Cancelled by customer', ${REFUND}` });
  if (!ok) {
    await findOrder(code);
    throw new UserError('The kitchen has already accepted this order, so it can no longer be cancelled here. Call the restaurant for help.');
  }
  await refundOnline(code, 'Cancelled by customer');
}

export async function rateOrder(code: string, rating: number): Promise<void> {
  if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new UserError('Choose between 1 and 5 stars.');
  const done = await sqlOne(
    `update orders set rating = $2::smallint where upper(code) = upper($1) and status = 'delivered' and rating is null returning id`,
    [code, rating],
  );
  if (!done) {
    const o = await findOrder(code);
    if (o.rating) throw new UserError('You have already rated this order.');
    throw new UserError('You can rate an order once it has been delivered.');
  }
  // The vendor's star rating is recalculated by the database
}

// ---------- Vendor actions ----------
/** The vendor board: everything still in progress plus the last day and a half. */
export async function getVendorOrders(vendorId: string): Promise<Order[]> {
  if (!isUuid(vendorId)) return [];
  return sql<Order>(
    `${ORDER_SELECT} where o.vendor_id = $1::uuid and ${REACHED_KITCHEN} and (${ACTIVE} or o.created_at > now() - interval '36 hours') order by o.created_at desc limit 300`,
    [vendorId],
  );
}

async function vendorOrder(vendorId: string, code: string): Promise<Order> {
  const o = await findOrder(code);
  if (o.vendor_id !== vendorId) throw new UserError('Order not found.');
  return o;
}

export async function vendorAccept(vendorId: string, code: string): Promise<void> {
  const o = await vendorOrder(vendorId, code);
  const ok = await transition({ code: o.code, from: ['placed'], to: 'preparing', events: ['accepted', 'preparing'] });
  if (!ok) throw new UserError(`${o.code} has already been ${STATUS_SHORT[o.status].toLowerCase()}.`);
  await tellCustomer(o.code, 'accepted');
}

export async function vendorDecline(vendorId: string, code: string, reason: string): Promise<void> {
  const o = await vendorOrder(vendorId, code);
  const why = reason.trim().slice(0, 200) || 'Declined by the restaurant';
  const ok = await transition({ code: o.code, from: ['placed'], to: 'cancelled', note: why, set: `cancel_reason = $7, ${REFUND}`, params: [why] });
  if (!ok) throw new UserError(`${o.code} can no longer be declined.`);
  await refundOnline(o.code, `Declined by the restaurant: ${why}`);
  await tellCustomer(o.code, 'declined');
}

export async function vendorReady(vendorId: string, code: string): Promise<void> {
  const o = await vendorOrder(vendorId, code);
  const ok = await transition({ code: o.code, from: ['accepted', 'preparing'], to: 'ready' });
  if (!ok) throw new UserError(`${o.code} is not being prepared.`);
  // Tell the rider (or the riders in town, if nobody has taken it yet)
  const ready = await findOrder(o.code);
  await Promise.all([notifyOrderReady(ready), notifyCustomer(ready, 'ready')]);
}

// ---------- Rider actions ----------
/** Deliveries no rider has taken yet, in the rider's own town. */
export async function getAvailableDeliveries(zoneId?: number): Promise<Order[]> {
  return sql<Order>(
    `${ORDER_SELECT} where o.rider_id is null and o.status in ('accepted', 'preparing', 'ready')
       and ($1::bigint is null or o.zone_id = $1::bigint) order by o.created_at limit 50`,
    [zoneId ?? null],
  );
}

export async function getRiderOrders(riderId: string): Promise<{ active: Order[]; done: Order[] }> {
  if (!isUuid(riderId)) return { active: [], done: [] };
  const mine = await sql<Order>(
    `${ORDER_SELECT} where o.rider_id = $1::uuid and (${ACTIVE} or o.created_at > now() - interval '7 days') order by o.created_at desc limit 200`,
    [riderId],
  );
  return { active: mine.filter((o) => isActive(o.status)), done: mine.filter((o) => !isActive(o.status)) };
}

export const MAX_ACTIVE_DELIVERIES = 2;

export async function riderAccept(rider: Rider, code: string): Promise<void> {
  // Only one rider can win: the update only happens if nobody has taken it yet
  const won = await sqlOne(
    `update orders set rider_id = $2::uuid, rider_name = $3, rider_phone = $4, rider_assigned_at = now()
     where upper(code) = upper($1) and rider_id is null and status in ('accepted', 'preparing', 'ready')
       and (select count(*) from orders x where x.rider_id = $2::uuid and x.status not in ('delivered', 'cancelled')) < $5::int
     returning id`,
    [code, rider.id, rider.full_name, rider.phone, MAX_ACTIVE_DELIVERIES],
  );
  if (won) {
    await tellCustomer(code, 'rider_assigned');
    return;
  }
  const o = await findOrder(code);
  if (o.rider_id && o.rider_id !== rider.id) throw new UserError('Another rider has already taken this delivery.');
  if (o.rider_id === rider.id) return;
  if (!['accepted', 'preparing', 'ready'].includes(o.status)) throw new UserError('This delivery is no longer available.');
  throw new UserError('Finish your current deliveries before taking more.');
}

export async function riderPickedUp(riderId: string, code: string): Promise<void> {
  if (!isUuid(riderId)) throw new UserError('This delivery is not assigned to you.');
  const ok = await transition({ code, from: ['ready'], to: 'picked_up', where: 'o.rider_id = $7::uuid', params: [riderId] });
  if (ok) {
    await tellCustomer(code, 'picked_up');
    return;
  }
  // The kitchen handed the food over but forgot to press "Mark as ready": record both steps
  const handedOver = await transition({
    code,
    from: ['accepted', 'preparing'],
    to: 'picked_up',
    events: ['ready', 'picked_up'],
    note: 'Rider collected before the kitchen marked it ready',
    where: 'o.rider_id = $7::uuid',
    params: [riderId],
  });
  if (handedOver) {
    await tellCustomer(code, 'picked_up');
    return;
  }
  const o = await findOrder(code);
  if (o.rider_id !== riderId) throw new UserError('This delivery is not assigned to you.');
  throw new UserError('This order can no longer be picked up.');
}

export const MAX_CODE_ATTEMPTS = 5;

/** The rider types the 4-digit code the customer reads out at the door. */
export async function riderDelivered(riderId: string, code: string, customerCode: string): Promise<void> {
  const o = await findOrder(code);
  if (o.rider_id !== riderId) throw new UserError('This delivery is not assigned to you.');
  if (o.status !== 'picked_up') throw new UserError('Confirm pickup first.');
  if (o.delivery_code_attempts >= MAX_CODE_ATTEMPTS) {
    throw new UserError('Too many wrong codes. Call support so we can confirm this delivery with the customer.');
  }
  const typed = customerCode.replace(/\D/g, '').slice(0, 4);
  // Not 4 digits is a typing slip, not a wrong code: don't use up a try
  if (typed.length !== 4) throw new UserError('Enter the 4-digit code the customer reads out.');
  const ok =
    (await transition({
      code: o.code,
      from: ['picked_up'],
      to: 'delivered',
      note: 'Confirmed with delivery code',
      set: `payment_status = case when payment_method = 'cash' then 'paid'::payment_status else payment_status end`,
      where: `o.rider_id = $7::uuid and o.delivery_code = $8 and o.delivery_code_attempts < $9::int`,
      params: [riderId, typed, MAX_CODE_ATTEMPTS],
    }));
  if (ok) {
    await tellCustomer(o.code, 'delivered');
    return;
  }

  const row = await sqlOne<{ delivery_code_attempts: number }>(
    'update orders set delivery_code_attempts = delivery_code_attempts + 1 where id = $1::uuid returning delivery_code_attempts',
    [o.id],
  );
  const left = MAX_CODE_ATTEMPTS - (row?.delivery_code_attempts ?? MAX_CODE_ATTEMPTS);
  throw new UserError(
    left > 0
      ? `That code is wrong. Ask the customer to check the code on their order page. ${left} ${left === 1 ? 'try' : 'tries'} left.`
      : 'Too many wrong codes. Call support so we can confirm this delivery with the customer.',
  );
}

// ---------- Admin actions ----------
export async function adminAssignRider(code: string, rider: Rider | null): Promise<void> {
  const o = await findOrder(code);
  if (!isActive(o.status)) throw new UserError('This order is already finished.');
  if (o.status === 'picked_up') throw new UserError('The rider already has the food.');
  if (rider && rider.id !== o.rider_id) {
    const busy = await sqlOne<{ n: number }>(
      `select count(*)::int as n from orders where rider_id = $1::uuid and status not in ('delivered', 'cancelled') and id <> $2::uuid`,
      [rider.id, o.id],
    );
    if ((busy?.n ?? 0) >= MAX_ACTIVE_DELIVERIES) {
      throw new UserError(`${rider.full_name} already has ${MAX_ACTIVE_DELIVERIES} deliveries. Choose another rider or wait until one is delivered.`);
    }
  }
  await sql(
    `update orders set rider_id = $2::uuid, rider_name = $3, rider_phone = $4, rider_assigned_at = case when $2::uuid is null then null else now() end
     where id = $1::uuid returning id`,
    [o.id, rider?.id ?? null, rider?.full_name ?? '', rider?.phone ?? ''],
  );
  if (rider && rider.id !== o.rider_id) await tellCustomer(o.code, 'rider_assigned');
}

/** For when the customer's phone is dead or the code can't be used. Always needs a reason. */
export async function adminForceDeliver(code: string, reason: string, by: string): Promise<void> {
  if (!reason.trim()) throw new UserError('Add a reason, for example how you confirmed with the customer.');
  const ok = await transition({
    code,
    from: ['picked_up'],
    to: 'delivered',
    note: `Confirmed by admin without code: ${reason.trim().slice(0, 200)}`,
    by,
    set: `payment_status = case when payment_method = 'cash' then 'paid'::payment_status else payment_status end`,
  });
  if (!ok) {
    await findOrder(code);
    throw new UserError('Only orders that are on the way can be marked delivered.');
  }
  await tellCustomer(code, 'delivered');
}

export async function adminCancel(code: string, reason: string): Promise<void> {
  const why = reason.trim().slice(0, 200) || 'Cancelled by Relax&Bite';
  const ok = await transition({
    code,
    from: ['pending_payment', 'placed', 'accepted', 'preparing', 'ready', 'picked_up'],
    to: 'cancelled',
    note: why,
    set: `cancel_reason = $7, ${REFUND}`,
    params: [why],
  });
  if (!ok) {
    await findOrder(code);
    throw new UserError('This order is already finished.');
  }
  await refundOnline(code, `Cancelled by Relax&Bite: ${why}`);
  await tellCustomer(code, 'cancelled');
}

export async function getStats(): Promise<{
  ordersToday: number;
  salesToday: number;
  active: number;
  liveVendors: number;
  ridersOnline: number;
  openIssues: number;
}> {
  const row = await sqlOne<Record<string, number>>(
    `select
       (select count(*) from orders o where created_at >= current_date and status not in ('cancelled', 'pending_payment'))::int as "ordersToday",
       (select coalesce(sum(total), 0) from orders o where created_at >= current_date and status not in ('cancelled', 'pending_payment'))::numeric as "salesToday",
       (select count(*) from orders o where ${ACTIVE})::int as active,
       (select count(*) from vendors v where v.status = 'approved' and ${OPEN_NOW})::int as "liveVendors",
       (select count(*) from riders where is_online)::int as "ridersOnline",
       (select count(*) from issues where status = 'open')::int as "openIssues"`,
  );
  return {
    ordersToday: Number(row?.ordersToday ?? 0),
    salesToday: Number(row?.salesToday ?? 0),
    active: Number(row?.active ?? 0),
    liveVendors: Number(row?.liveVendors ?? 0),
    ridersOnline: Number(row?.ridersOnline ?? 0),
    openIssues: Number(row?.openIssues ?? 0),
  };
}

/** Numbers for the panel menus: badges and the admin's security count. */
export async function getPanelCounts(vendorId: string | null): Promise<{ newOrders: number; pendingApps: number; openIssues: number; failedSignins24h: number }> {
  const row = await sqlOne<Record<string, number>>(
    `select
       (select count(*) from orders where $1::uuid is not null and vendor_id = $1::uuid and status = 'placed')::int as "newOrders",
       (select count(*) from partner_accounts where status = 'pending')::int as "pendingApps",
       (select count(*) from issues where status = 'open')::int as "openIssues",
       (select count(*) from activity_log where at > now() - interval '24 hours' and kind in ('signin_failed', 'lockout'))::int as "failedSignins24h"`,
    [isUuid(vendorId) ? vendorId : null],
  );
  return {
    newOrders: Number(row?.newOrders ?? 0),
    pendingApps: Number(row?.pendingApps ?? 0),
    openIssues: Number(row?.openIssues ?? 0),
    failedSignins24h: Number(row?.failedSignins24h ?? 0),
  };
}

// =====================================================================
// Problems reported by customers, vendors and riders
// =====================================================================
export const ISSUE_CATEGORIES: Record<ReporterRole, string[]> = {
  customer: ['Food not received', 'Wrong or missing items', 'Rider behaviour', 'Food quality', 'Payment problem', 'Other'],
  vendor: ['Rider did not arrive', 'Rider behaviour', 'Customer problem', 'Payment problem', 'Other'],
  rider: ["Can't reach the customer", 'Wrong address', 'Restaurant delay', 'Emergency on the road', 'Customer behaviour', 'Other'],
};

const ISSUE_COLS = 'id, order_code, reporter_role, reporter_name, reporter_phone, category, message, status, resolution, created_at, resolved_at';

export async function createIssue(input: {
  order_code: string | null;
  reporter_role: ReporterRole;
  reporter_name: string;
  reporter_phone: string;
  category: string;
  message: string;
}): Promise<Issue> {
  if (!ISSUE_CATEGORIES[input.reporter_role].includes(input.category)) throw new UserError('Choose what the problem is about.');
  if (input.message.trim().length < 5 && input.category === 'Other') throw new UserError('Tell us a little about the problem.');
  const order = input.order_code ? await getOrderByCode(input.order_code) : undefined;
  const issue = await sqlOne<Issue>(
    `insert into issues (order_code, reporter_role, reporter_name, reporter_phone, category, message)
     values ($1, $2::reporter_role, $3, $4, $5, $6) returning ${ISSUE_COLS}`,
    [order?.code ?? null, input.reporter_role, input.reporter_name.slice(0, 80), input.reporter_phone.slice(0, 20), input.category, input.message.trim().slice(0, 600)],
  );
  return issue!;
}

export async function listIssues(): Promise<Issue[]> {
  return sql<Issue>(`select ${ISSUE_COLS} from issues order by (status = 'resolved'), created_at desc limit 300`);
}

export async function resolveIssue(id: string, resolution: string, by = ''): Promise<void> {
  if (!resolution.trim()) throw new UserError('Write what you did to resolve it.');
  const done =
    isUuid(id) &&
    (await sqlOne(
      `update issues set status = 'resolved', resolution = $2, resolved_at = now(), resolved_by = nullif($3, '') where id = $1::uuid returning id`,
      [id, resolution.trim().slice(0, 600), by],
    ));
  if (!done) throw new UserError('Report not found.');
}

// =====================================================================
// Activity log (append-only in the database)
// =====================================================================
export async function audit(
  actor: string,
  action: string,
  opts: { kind?: ActivityKind; severity?: AuditEntry['severity']; ip?: string; device?: string } = {},
): Promise<void> {
  const kind: ActivityKind =
    opts.kind ?? (actor.endsWith('(admin)') ? 'admin' : actor.endsWith('(vendor)') ? 'store' : actor.endsWith('(rider)') ? 'delivery' : 'order');
  try {
    await sql(
      `insert into activity_log (actor, action, kind, severity, ip, device)
       values ($1, $2, $3::activity_kind, $4::activity_severity, $5, $6) returning id`,
      [actor.slice(0, 120), action.slice(0, 500), kind, opts.severity ?? 'info', opts.ip ?? null, opts.device ?? null],
    );
  } catch (e) {
    // Never block someone's action because the log failed; the server log keeps the reason
    console.error('Activity log failed:', e);
  }
}

const ACTIVITY_COLS = 'at, actor, action, kind, severity, ip, device';

export async function getAudit(limit = 15): Promise<AuditEntry[]> {
  return sql<AuditEntry>(`select ${ACTIVITY_COLS} from activity_log order by id desc limit $1::int`, [Math.min(limit, 500)]);
}

export async function listActivity(filter: { kinds?: ActivityKind[]; q?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const q = (filter.q ?? '').trim().slice(0, 60);
  return sql<AuditEntry>(
    `select ${ACTIVITY_COLS} from activity_log
     where ($1::jsonb is null or kind::text in (select jsonb_array_elements_text($1::jsonb)))
       and ($2 = '' or (actor || ' ' || action || ' ' || coalesce(ip, '') || ' ' || coalesce(device, '')) ilike '%' || $2 || '%')
     order by id desc limit $3::int`,
    [filter.kinds ?? null, likeEscape(q), Math.min(filter.limit ?? 300, 1000)],
  );
}

/** Sign-in problems in the last `hours`, for the admin overview. */
export async function securitySummary(hours = 24): Promise<{ failed: number; lockouts: number; adminFailed: number }> {
  const row = await sqlOne<Record<string, number>>(
    `select
       count(*) filter (where kind = 'signin_failed')::int as failed,
       count(*) filter (where kind = 'lockout')::int as lockouts,
       count(*) filter (where kind in ('signin_failed', 'lockout') and actor like '%(admin)')::int as "adminFailed"
     from activity_log where at > now() - make_interval(hours => $1::int)`,
    [hours],
  );
  return { failed: Number(row?.failed ?? 0), lockouts: Number(row?.lockouts ?? 0), adminFailed: Number(row?.adminFailed ?? 0) };
}

/** Latest warnings and new applications, for the admin's pop-up alerts. */
export async function recentAlerts(limit = 40): Promise<AuditEntry[]> {
  return sql<AuditEntry>(
    `select ${ACTIVITY_COLS} from activity_log where severity <> 'info' or kind = 'register' order by id desc limit $1::int`,
    [limit],
  );
}

// =====================================================================
// Labels shared by pages
// =====================================================================
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Waiting for payment',
  placed: 'Order placed',
  accepted: 'Accepted by the kitchen',
  preparing: 'Preparing your food',
  ready: 'Ready for pickup',
  picked_up: 'Rider on the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_SHORT: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  placed: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  picked_up: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// Wording for customers (orders list and tracking)
export const CUSTOMER_STATUS: Record<OrderStatus, string> = {
  ...STATUS_SHORT,
  placed: 'Placed',
};

export const STATUS_BADGE: Record<OrderStatus, string> = {
  pending_payment: 'bg-fill text-ink-soft',
  placed: 'bg-brand text-on-brand',
  accepted: 'bg-brand-soft text-brand-ink',
  preparing: 'bg-brand-soft text-brand-ink',
  ready: 'bg-warning-soft text-warning-ink',
  picked_up: 'bg-warning-soft text-warning-ink',
  delivered: 'bg-success-soft text-success',
  cancelled: 'bg-fill text-ink-soft',
};

export function isActive(status: OrderStatus): boolean {
  return !['delivered', 'cancelled'].includes(status);
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 6e4));
}
