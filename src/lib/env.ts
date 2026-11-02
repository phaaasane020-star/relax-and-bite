// Server-side settings from .env (on your computer) or the Netlify
// dashboard (live site). Written out in full so Astro can find them, with a
// fallback that reads the .env file directly while developing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
  // Paystack secret key: sk_test_... while testing, sk_live_... for real money
  'PAYSTACK_SECRET_KEY',
  // Only for automated tests: a stand-in for Paystack's servers
  'PAYSTACK_API_URL',
  // Resend (resend.com) sends the emails: your API key, and who emails come from,
  // for example: Relax&Bite <hello@yourdomain.com> (a domain you've verified in Resend)
  'RESEND_API_KEY',
  'EMAIL_FROM',
  // Google sign-in: from Google Cloud > APIs & Services > Credentials (OAuth client, "Web application")
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  // The live address of the site (for links in emails and Google sign-in), like https://relaxandbite.com
  'PUBLIC_SITE_URL',
  // Notifications in browsers (Web Push): make a pair with  node scripts/vapid-keys.mjs
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  // Notifications in the Android app: Firebase > Project settings > Service accounts >
  // Generate new private key; paste the whole JSON file on one line
  'FCM_SERVICE_ACCOUNT',
  // Only for automated tests: stand-ins for Resend and Google
  'RESEND_API_URL',
  'GOOGLE_API_URL',
  'FCM_API_URL',
] as const;
type Key = (typeof KEYS)[number];
type Vars = Record<Key, string>;
let fromFile: Partial<Vars> | null = null;

function readDotEnv(): Partial<Vars> {
  if (fromFile) return fromFile;
  fromFile = {};
  try {
    const path = join(process.cwd(), '.env');
    if (!existsSync(path)) return fromFile;
    // Handles UTF-8 and the UTF-16 Notepad sometimes saves
    let text = readFileSync(path, 'utf8');
    if (text.includes('\u0000')) text = readFileSync(path, 'utf16le');
    for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim() as Key;
      const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if ((KEYS as readonly string[]).includes(key)) fromFile[key] = value;
    }
  } catch {
    /* no file on the live site: values come from Netlify */
  }
  return fromFile;
}

export function serverEnv(): Vars {
  const node = typeof process !== 'undefined' ? process.env : {};
  const vars: Vars = {
    SUPABASE_URL: import.meta.env.SUPABASE_URL || node.SUPABASE_URL || '',
    SUPABASE_SERVICE_ROLE_KEY: import.meta.env.SUPABASE_SERVICE_ROLE_KEY || node.SUPABASE_SERVICE_ROLE_KEY || '',
    SESSION_SECRET: import.meta.env.SESSION_SECRET || node.SESSION_SECRET || '',
    PAYSTACK_SECRET_KEY: import.meta.env.PAYSTACK_SECRET_KEY || node.PAYSTACK_SECRET_KEY || '',
    PAYSTACK_API_URL: import.meta.env.PAYSTACK_API_URL || node.PAYSTACK_API_URL || '',
    RESEND_API_KEY: import.meta.env.RESEND_API_KEY || node.RESEND_API_KEY || '',
    EMAIL_FROM: import.meta.env.EMAIL_FROM || node.EMAIL_FROM || '',
    GOOGLE_CLIENT_ID: import.meta.env.GOOGLE_CLIENT_ID || node.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: import.meta.env.GOOGLE_CLIENT_SECRET || node.GOOGLE_CLIENT_SECRET || '',
    PUBLIC_SITE_URL: import.meta.env.PUBLIC_SITE_URL || node.PUBLIC_SITE_URL || '',
    RESEND_API_URL: import.meta.env.RESEND_API_URL || node.RESEND_API_URL || '',
    GOOGLE_API_URL: import.meta.env.GOOGLE_API_URL || node.GOOGLE_API_URL || '',
    VAPID_PUBLIC_KEY: import.meta.env.VAPID_PUBLIC_KEY || node.VAPID_PUBLIC_KEY || '',
    VAPID_PRIVATE_KEY: import.meta.env.VAPID_PRIVATE_KEY || node.VAPID_PRIVATE_KEY || '',
    FCM_SERVICE_ACCOUNT: import.meta.env.FCM_SERVICE_ACCOUNT || node.FCM_SERVICE_ACCOUNT || '',
    FCM_API_URL: import.meta.env.FCM_API_URL || node.FCM_API_URL || '',
  };
  const file = readDotEnv();
  for (const key of KEYS) vars[key] ||= file[key] ?? '';
  return vars;
}
