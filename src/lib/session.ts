// Cookie helpers for the server. The customer and my-orders cookies are
// signed, so they can't be edited in the browser to impersonate someone.
import type { AstroCookies } from 'astro';
import { readSigned, signValue } from './sign';

// Cookies only travel over https on the live site
const secure = import.meta.env.PROD === true;

/** `area` is the customer's own name for their locality when it isn't on our list */
export type SavedLocation = { zoneId: number; localityId?: number | null; area?: string; landmark: string; details: string };
/** A signed-in customer. `phone` is the number they last ordered with, if any. */
export type SessionUser = { id: string; email: string; name: string; phone?: string | null };

const LOCATION = 'rb_location';
// v3: customers sign in with email or Google (older phone sign-ins are signed out)
const USER = 'rb_user_v3';
const YEAR = 60 * 60 * 24 * 365;

export function getLocation(cookies: AstroCookies): SavedLocation | null {
  try {
    const v = cookies.get(LOCATION)?.json() as SavedLocation | undefined;
    return v && typeof v.zoneId === 'number' ? v : null;
  } catch {
    return null;
  }
}

export function setLocation(cookies: AstroCookies, loc: SavedLocation): void {
  cookies.set(LOCATION, JSON.stringify(loc), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

const USER_DAYS = 30;

export function getUser(cookies: AstroCookies): SessionUser | null {
  const v = readSigned<SessionUser & { exp: number }>(cookies.get(USER)?.value);
  return v && v.id && v.email && v.exp > Date.now() ? { id: v.id, email: v.email, name: v.name ?? '', phone: v.phone ?? null } : null;
}

export function setUser(cookies: AstroCookies, user: SessionUser): void {
  const value = signValue({ ...user, exp: Date.now() + USER_DAYS * 864e5 });
  cookies.set(USER, value, { path: '/', maxAge: 60 * 60 * 24 * USER_DAYS, sameSite: 'lax', httpOnly: true, secure });
}

export function clearUser(cookies: AstroCookies): void {
  cookies.delete(USER, { path: '/' });
}

/** Only allow redirects to our own pages. */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

// ---------- Partner (vendor, rider, admin) sign-in ----------
const PARTNER = 'rb_partner';

export function getPartnerToken(cookies: AstroCookies): string | undefined {
  return cookies.get(PARTNER)?.value;
}

export function setPartnerToken(cookies: AstroCookies, token: string): void {
  cookies.set(PARTNER, token, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax', httpOnly: true, secure });
}

export function clearPartnerToken(cookies: AstroCookies): void {
  cookies.delete(PARTNER, { path: '/' });
}

// ---------- Orders placed from this browser ----------
// Lets someone who isn't signed in see their own orders (and the delivery
// code) without exposing other people's orders to anyone who guesses a code.
const MY_ORDERS = 'rb_my_orders_v3';

export function getMyOrders(cookies: AstroCookies): string[] {
  const v = readSigned<unknown>(cookies.get(MY_ORDERS)?.value);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function addMyOrder(cookies: AstroCookies, code: string): void {
  const list = [code, ...getMyOrders(cookies).filter((c) => c !== code)].slice(0, 30);
  cookies.set(MY_ORDERS, signValue(list), { path: '/', maxAge: 60 * 60 * 24 * 180, sameSite: 'lax', httpOnly: true, secure });
}

/** True when this visitor placed the order (same browser) or is signed in with the order's phone. */
export function ownsOrder(cookies: AstroCookies, order: { code: string; customer_phone: string }): boolean {
  const user = getUser(cookies);
  return (user !== null && user.phone === order.customer_phone) || getMyOrders(cookies).includes(order.code);
}
