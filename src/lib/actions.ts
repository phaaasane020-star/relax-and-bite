// Helpers for panel pages that handle form posts (post, redirect, show a message).
import type { AstroCookies } from 'astro';

const FLASH = 'rb_flash';

/** Save a one-time message to show after the redirect. */
export function flash(cookies: AstroCookies, message: string): void {
  cookies.set(FLASH, message, { path: '/', maxAge: 60, sameSite: 'lax', httpOnly: true });
}

/** Read and clear the one-time message. */
export function takeFlash(cookies: AstroCookies): string {
  const msg = cookies.get(FLASH)?.value ?? '';
  if (msg) cookies.delete(FLASH, { path: '/' });
  return msg;
}

export function field(form: FormData, key: string, max = 300): string {
  return String(form.get(key) ?? '').trim().slice(0, max);
}

export function num(form: FormData, key: string): number {
  const n = Number(String(form.get(key) ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}
