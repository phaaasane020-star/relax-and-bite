// The site's public address: PUBLIC_SITE_URL in .env (the live domain), or the
// address this request came in on (while developing).
import { serverEnv } from './env';

export function siteOrigin(url: URL): string {
  const fixed = serverEnv().PUBLIC_SITE_URL.trim().replace(/\/+$/, '');
  return fixed || url.origin;
}
