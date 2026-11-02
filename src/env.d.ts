/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    partner?: import('./data/types').PartnerAccount;
  }
}

interface ImportMetaEnv {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly SESSION_SECRET?: string;
}
