// Partner accounts (vendors, riders, admins) on Supabase: registration,
// phone + password sign-in with lockout, sessions and approval.
import { sql, sqlOne, UserError } from '../lib/supabase';
import { isUuid } from '../lib/ids';
import { hashToken } from '../lib/sign';
import type { AccountStatus, PartnerAccount, PartnerRole, Rider, Vendor, VehicleType } from './types';
import { hashPassword, newToken, verifyPassword } from '../lib/password';
import { randomInt } from 'node:crypto';
import { normalizePhone } from '../lib/format';
import { formatGhanaCard, isGhanaCard } from '../lib/ghana-card';
import { licenceProblem, tidyLicence } from '../lib/licence';
import { VENDOR_COLS } from './store';
import { normalizeEmail } from './customers';
import { businessTypes } from './catalog';

const SESSION_DAYS = 30;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export function homeFor(account: Pick<PartnerAccount, 'role' | 'status'>): string {
  if (account.status !== 'approved') return '/partner/pending';
  return account.role === 'admin' ? '/admin' : account.role === 'vendor' ? '/vendor' : '/rider';
}

/** "Esi Mensah (vendor)": how partners appear in the activity log. */
export function accountLabel(a: Pick<PartnerAccount, 'full_name' | 'role'>): string {
  return `${a.full_name} (${a.role})`;
}

const ACCOUNT_SELECT = `select a.id, a.password_hash, a.role, a.full_name, a.phone, a.email, a.status, a.status_reason, a.failed_logins,
  coalesce((extract(epoch from a.locked_until) * 1000)::bigint, 0) as locked_until,
  v.id as vendor_id, r.id as rider_id, a.created_at
  from partner_accounts a
  left join vendors v on v.owner_account_id = a.id
  left join riders r on r.account_id = a.id`;

function clean(a: PartnerAccount | undefined): PartnerAccount | undefined {
  return a ? { ...a, locked_until: Number(a.locked_until) || 0 } : undefined;
}

// ---------- Sessions (only a hash of the cookie token is stored) ----------
export async function createSession(accountId: string, info: { ip?: string; device?: string } = {}): Promise<string> {
  const token = newToken();
  await sql(
    `insert into partner_sessions (token_hash, account_id, expires_at, ip, device)
     values ($1, $2::uuid, now() + make_interval(days => $3::int), $4, $5) returning token_hash`,
    [hashToken(token), accountId, SESSION_DAYS, info.ip ?? null, info.device ?? null],
  );
  await sql('update partner_accounts set last_signin_at = now() where id = $1::uuid returning id', [accountId]);
  return token;
}

export async function getSessionAccount(token: string | undefined): Promise<PartnerAccount | null> {
  if (!token || token.length > 100) return null;
  const a = await sqlOne<PartnerAccount>(
    `${ACCOUNT_SELECT} join partner_sessions s on s.account_id = a.id where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  return clean(a) ?? null;
}

export async function endSession(token: string | undefined): Promise<void> {
  if (token) await sql('delete from partner_sessions where token_hash = $1 returning token_hash', [hashToken(token)]);
}

/** Signs a partner out on every phone and computer (after a password change or suspension). */
export async function endAllSessions(accountId: string): Promise<void> {
  if (isUuid(accountId)) await sql('delete from partner_sessions where account_id = $1::uuid returning token_hash', [accountId]);
}

// ---------- Sign in ----------
export async function findAccountByPhone(phoneInput: string): Promise<PartnerAccount | undefined> {
  const phone = normalizePhone(phoneInput);
  return phone ? clean(await sqlOne<PartnerAccount>(`${ACCOUNT_SELECT} where a.phone = $1`, [phone])) : undefined;
}

export async function signIn(phoneInput: string, password: string): Promise<PartnerAccount> {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new UserError('Enter the phone number you registered with, for example 024 123 4567.');
  const account = await findAccountByPhone(phone);
  if (account && account.locked_until > Date.now()) {
    const mins = Math.ceil((account.locked_until - Date.now()) / 6e4);
    throw new UserError(`Too many wrong passwords. For your safety, sign-in is paused for ${mins} more ${mins === 1 ? 'minute' : 'minutes'}.`);
  }
  if (!account || !verifyPassword(password, account.password_hash)) {
    if (account) {
      // Count the miss; on the 5th, lock the account for 15 minutes
      const row = await sqlOne<{ locked: boolean }>(
        `update partner_accounts set
           failed_logins = case when failed_logins + 1 >= $2::int then 0 else failed_logins + 1 end,
           locked_until = case when failed_logins + 1 >= $2::int then now() + make_interval(mins => $3::int) else locked_until end
         where id = $1::uuid returning (locked_until > now()) as locked`,
        [account.id, MAX_FAILED, LOCK_MINUTES],
      );
      if (row?.locked) throw new UserError(`Too many wrong passwords. For your safety, sign-in is paused for ${LOCK_MINUTES} minutes.`);
    }
    throw new UserError('That phone number and password do not match. Check them and try again.');
  }
  await sql('update partner_accounts set failed_logins = 0, locked_until = null where id = $1::uuid returning id', [account.id]);
  return { ...account, failed_logins: 0, locked_until: 0 };
}

/** Changes a partner's password after checking the current one, and signs out other devices. */
export async function changePassword(accountId: string, current: string, next: string, keepToken?: string): Promise<void> {
  const a = await getAccount(accountId);
  if (!a) throw new UserError('Account not found.');
  if (!verifyPassword(current, a.password_hash)) throw new UserError('Your current password is not right.');
  if (next.length < 8) throw new UserError('Use a new password with at least 8 characters.');
  if (next === current) throw new UserError('Choose a new password that is different from the current one.');
  await sql('update partner_accounts set password_hash = $2 where id = $1::uuid returning id', [accountId, hashPassword(next)]);
  await sql('delete from partner_sessions where account_id = $1::uuid and token_hash <> $2 returning token_hash', [accountId, keepToken ? hashToken(keepToken) : '']);
}

/** The name shown on the account (panel header, activity log). */
export async function updateAccountName(accountId: string, name: string): Promise<string> {
  const clean = name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (clean.length < 3) throw new UserError('Enter your name (at least 3 letters).');
  // The rider record and the rider's deliveries in progress carry the name too
  const done = await sqlOne<{ full_name: string }>(
    `with a as (
       update partner_accounts set full_name = $2 where id = $1::uuid returning id, full_name
     ), r as (
       update riders set full_name = $2 where account_id in (select id from a) returning id
     ), o as (
       update orders set rider_name = $2
       where rider_id in (select id from r) and status not in ('delivered', 'cancelled') returning id
     )
     select full_name from a`,
    [accountId, clean],
  );
  if (!done) throw new UserError('Account not found.');
  return done.full_name;
}

/** The email new orders are sent to (vendors and riders). Empty turns the emails off. */
export async function updateAccountEmail(accountId: string, raw: string): Promise<string | null> {
  const email = partnerEmail(raw);
  await sql('update partner_accounts set email = $2 where id = $1::uuid returning id', [accountId, email]);
  return email;
}

/** Optional email for order alerts: null when left empty, an error when it isn't an email. */
function partnerEmail(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const email = normalizeEmail(raw);
  if (!email) throw new UserError('Enter a valid email address for order alerts, for example ama@gmail.com, or leave it empty.');
  return email;
}

// ---------- Registration ----------
type Common = { full_name: string; phone: string; password: string; email?: string };

async function validateCommon(input: Common): Promise<{ phone: string; email: string | null }> {
  if (input.full_name.trim().length < 3) throw new UserError('Enter your full name.');
  const phone = normalizePhone(input.phone);
  if (!phone) throw new UserError('Enter a valid Ghana phone number, for example 024 123 4567.');
  if (await findAccountByPhone(phone)) throw new UserError('An account with this phone number already exists. Sign in instead.');
  if (input.password.length < 8) throw new UserError('Use a password with at least 8 characters.');
  return { phone, email: partnerEmail(input.email) };
}

async function uniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'store';
  const taken = new Set(
    (await sql<{ slug: string }>(`select slug from vendors where slug = $1 or slug like $1 || '-%'`, [base])).map((r) => r.slug),
  );
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

export async function registerVendor(
  input: Common & {
    business_name: string;
    description: string;
    cuisine_tags: string;
    address: string;
    zone_id: number;
    locality_id: number | null;
    business_type: string;
  },
): Promise<PartnerAccount> {
  const { phone, email } = await validateCommon(input);
  if (input.business_name.trim().length < 2) throw new UserError('Enter your business name.');
  if (!(await sqlOne('select id from zones where id = $1::bigint', [input.zone_id]))) throw new UserError('Choose your town.');
  let localityId: number | null = null;
  if (input.locality_id) {
    const l = await sqlOne<{ id: number }>('select id from localities where id = $1::bigint and zone_id = $2::bigint', [input.locality_id, input.zone_id]);
    if (!l) throw new UserError('Choose a locality in your town.');
    localityId = l.id;
  }
  if (!businessTypes.includes(input.business_type)) throw new UserError('Choose your business type.');

  // Account and store are created together, or not at all
  const row = await sqlOne<{ id: string }>(
    `with a as (
       insert into partner_accounts (role, full_name, phone, password_hash, email) values ('vendor', $1, $2, $3, $12) returning id
     ), v as (
       insert into vendors (owner_account_id, slug, name, description, cuisine_tags, address, zone_id, locality_id, phone, business_type, prep_time_min, prep_time_max, delivery_fee)
       -- Starts with the town's usual delivery fee; the restaurant can change it in Store settings
       select a.id, $4, $5, $6, array(select jsonb_array_elements_text($7::jsonb)), $8, $9::bigint, $10::bigint, $2, $11, 20, 35,
         coalesce((select least(z.delivery_fee, 100) from zones z where z.id = $9::bigint), 10) from a
       returning id
     )
     select a.id from a, v`,
    [
      input.full_name.trim().slice(0, 80),
      phone,
      hashPassword(input.password),
      await uniqueSlug(input.business_name),
      input.business_name.trim().slice(0, 80),
      input.description.trim().slice(0, 300),
      input.cuisine_tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6),
      input.address.trim().slice(0, 160),
      input.zone_id,
      localityId,
      input.business_type,
      email,
    ],
  );
  return (await getAccount(row!.id))!;
}

export async function registerRider(
  input: Common & {
    zone_id: number;
    vehicle: VehicleType;
    plate_number: string;
    licence_number: string;
    ghana_card: string;
    photo_url: string;
    ghana_card_photo_url: string;
    emergency_name: string;
    emergency_phone: string;
  },
  /** An admin adding a rider in person can leave the photos for later */
  opts: { photosOptional?: boolean } = {},
): Promise<PartnerAccount> {
  const { phone, email } = await validateCommon(input);
  const isPhoto = (v: string) => v.startsWith('data:image/') && v.length < 2_000_000;
  const photoOk = (v: string) => isPhoto(v) || (opts.photosOptional === true && v === '');
  if (!photoOk(input.photo_url)) throw new UserError('Add a clear passport-sized photo of your face.');
  if (!photoOk(input.ghana_card_photo_url)) throw new UserError('Add a photo of the front of your Ghana Card.');
  if (input.emergency_name.trim().length < 3) throw new UserError('Add an emergency contact name.');
  const emergencyPhone = normalizePhone(input.emergency_phone);
  if (!emergencyPhone) throw new UserError('Add a valid phone number for your emergency contact.');
  if (emergencyPhone === phone) throw new UserError('Your emergency contact needs a different number from yours.');
  if (!(await sqlOne('select id from zones where id = $1::bigint', [input.zone_id]))) throw new UserError('Choose the area you will ride in.');
  if (!['motorbike', 'bicycle'].includes(input.vehicle)) throw new UserError('Choose your vehicle.');
  if (input.vehicle === 'motorbike' && !input.plate_number.trim()) throw new UserError('Enter your motorbike number plate.');
  if (input.vehicle === 'motorbike') {
    const problem = licenceProblem(input.licence_number);
    if (problem) throw new UserError(problem);
  }
  if (!isGhanaCard(input.ghana_card)) throw new UserError('Enter your Ghana Card number, for example GHA-123456789-0.');
  const ghanaCard = formatGhanaCard(input.ghana_card);
  if (await sqlOne('select id from riders where ghana_card = $1', [ghanaCard])) {
    throw new UserError('This Ghana Card is already registered. If it is yours, call support.');
  }

  const row = await sqlOne<{ id: string }>(
    `with a as (
       insert into partner_accounts (role, full_name, phone, password_hash, email) values ('rider', $1, $2, $3, $13) returning id, full_name
     ), r as (
       insert into riders (account_id, full_name, phone, zone_id, vehicle, plate_number, licence_number, ghana_card,
         photo_url, ghana_card_photo_path, emergency_name, emergency_phone)
       select a.id, a.full_name, $2, $4::bigint, $5::vehicle_type, $6, $7, $8, $9, $10, $11, $12 from a
       returning id
     )
     select a.id from a, r`,
    [
      input.full_name.trim().slice(0, 80),
      phone,
      hashPassword(input.password),
      input.zone_id,
      input.vehicle,
      input.vehicle === 'motorbike' ? input.plate_number.trim().toUpperCase().slice(0, 20) : '',
      input.vehicle === 'motorbike' ? tidyLicence(input.licence_number, true) : '',
      ghanaCard,
      input.photo_url || null,
      input.ghana_card_photo_url || null,
      input.emergency_name.trim().slice(0, 80),
      emergencyPhone,
      email,
    ],
  );
  return (await getAccount(row!.id))!;
}

// ---------- Accounts added by an admin ----------
/** A temporary password that's easy to read out or type: no 0/O or 1/l/I. */
export function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[randomInt(0, chars.length)];
  return `RB-${out}`;
}

/** Add another admin. They sign in with their phone and the temporary password. */
export async function addAdmin(input: { full_name: string; phone: string }): Promise<{ account: PartnerAccount; password: string }> {
  const name = input.full_name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (name.length < 3) throw new UserError("Enter the new admin's full name.");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new UserError('Enter a valid Ghana phone number, for example 024 123 4567.');
  if (await findAccountByPhone(phone)) throw new UserError('This phone number already has an account. Use another number.');
  const password = tempPassword();
  const row = await sqlOne<{ id: string }>(
    `insert into partner_accounts (role, full_name, phone, password_hash, status) values ('admin', $1, $2, $3, 'approved') returning id`,
    [name, phone, hashPassword(password)],
  );
  return { account: (await getAccount(row!.id))!, password };
}

/** Switch an admin off or back on. You can't switch yourself off, or the last admin. */
export async function setAdminActive(id: string, active: boolean, byId: string, reason = ''): Promise<PartnerAccount> {
  const a = await getAccount(id);
  if (!a || a.role !== 'admin') throw new UserError('Admin not found.');
  if (!active) {
    if (a.id === byId) throw new UserError("You can't switch off your own account. Ask another admin.");
    const others = await sqlOne<{ n: number }>(
      `select count(*)::int as n from partner_accounts where role = 'admin' and status = 'approved' and id <> $1::uuid`,
      [id],
    );
    if (!others || others.n < 1) throw new UserError('There must always be at least one active admin.');
    if (!reason.trim()) throw new UserError('Add a short reason.');
  }
  await sql('update partner_accounts set status = $2::account_status, status_reason = $3 where id = $1::uuid returning id', [
    id,
    active ? 'approved' : 'suspended',
    active ? '' : reason.trim().slice(0, 300),
  ]);
  if (!active) await endAllSessions(id);
  return a;
}

/** Admins with when they last signed in, for the Admins list. */
export async function listAdmins(): Promise<(PartnerAccount & { last_signin_at: string | null })[]> {
  const rows = await sql<PartnerAccount & { last_signin_at: string | null }>(
    `select a.id, a.role, a.full_name, a.phone, a.status, a.status_reason, a.failed_logins, 0 as locked_until,
       null as vendor_id, null as rider_id, a.created_at, a.last_signin_at, '' as password_hash
     from partner_accounts a where a.role = 'admin' order by a.status = 'approved' desc, a.created_at`,
  );
  return rows.map((a) => ({ ...a, locked_until: 0 }));
}

// ---------- Accounts (admin) ----------
export async function getAccount(id: string): Promise<PartnerAccount | undefined> {
  if (!isUuid(id)) return undefined;
  return clean(await sqlOne<PartnerAccount>(`${ACCOUNT_SELECT} where a.id = $1::uuid`, [id]));
}

export async function listAccounts(filter: { role?: PartnerRole; status?: AccountStatus } = {}): Promise<PartnerAccount[]> {
  const rows = await sql<PartnerAccount>(
    `${ACCOUNT_SELECT} where ($1::text is null or a.role::text = $1) and ($2::text is null or a.status::text = $2) order by a.created_at desc limit 500`,
    [filter.role ?? null, filter.status ?? null],
  );
  return rows.map((a) => clean(a)!);
}

export async function setAccountStatus(id: string, status: AccountStatus, reason = ''): Promise<void> {
  const a = await getAccount(id);
  if (!a) throw new UserError('Account not found.');
  if (a.role === 'admin') throw new UserError('Admin accounts cannot be changed here.');
  if ((status === 'rejected' || status === 'suspended') && !reason.trim()) throw new UserError('Add a short reason. The applicant will see it.');

  // Account, store and rider change together
  await sql(
    `with a as (
       update partner_accounts set status = $2::account_status, status_reason = $3 where id = $1::uuid returning id
     ), v as (
       update vendors set status = (case when $2 = 'approved' then 'approved' when $2 = 'suspended' then 'suspended' else 'pending' end)::vendor_status,
         is_open = case when $2 = 'approved' then is_open else false end,
         approved_at = case when $2 = 'approved' then coalesce(approved_at, now()) else approved_at end
       where owner_account_id in (select id from a) returning id
     ), r as (
       update riders set is_online = case when $2 = 'approved' then is_online else false end
       where account_id in (select id from a) returning id
     )
     select id from a`,
    [id, status, reason.trim().slice(0, 300)],
  );
  // Someone suspended or rejected is signed out everywhere
  if (status === 'suspended' || status === 'rejected') await endAllSessions(id);
}

// ---------- Riders ----------
const RIDER_COLS = `r.id, r.account_id, r.full_name, r.phone, r.zone_id, r.vehicle, r.plate_number, r.licence_number, r.ghana_card,
  r.photo_url, r.ghana_card_photo_path as ghana_card_photo_url, r.emergency_name, r.emergency_phone, r.is_online, r.rating, r.created_at`;

export async function getRider(id: string | null): Promise<Rider | undefined> {
  if (!isUuid(id)) return undefined;
  return sqlOne<Rider>(`select ${RIDER_COLS} from riders r where r.id = $1::uuid`, [id]);
}

export async function listRiders(): Promise<(Rider & { account: PartnerAccount })[]> {
  const rows = await sql<Rider & { account: PartnerAccount }>(
    `select ${RIDER_COLS},
       (select to_jsonb(x) from (select a.id, a.role, a.full_name, a.phone, a.status, a.status_reason, a.created_at from partner_accounts a where a.id = r.account_id) x) as account
     from riders r order by r.created_at desc limit 500`,
  );
  return rows.filter((r) => r.account);
}

export async function setRiderOnline(riderId: string, online: boolean): Promise<void> {
  const done = isUuid(riderId) && (await sqlOne('update riders set is_online = $2::boolean where id = $1::uuid returning id', [riderId, online]));
  if (!done) throw new UserError('Rider not found.');
}

export async function getVendorForAccount(account: PartnerAccount): Promise<Vendor | undefined> {
  if (!isUuid(account.vendor_id)) return undefined;
  return sqlOne<Vendor>(`select ${VENDOR_COLS} from vendors v where v.id = $1::uuid`, [account.vendor_id]);
}
