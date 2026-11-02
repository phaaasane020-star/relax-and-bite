// Promo codes on the customer's side. A promoter can share a link like
// relaxandbite.com/?promo=KOFI10: the code is remembered on that phone and
// filled in at checkout. Used by both the server and the browser.

const KEY = 'rb_promo';

/** KOFI 10, kofi10 and Kofi-10 are all KOFI10. */
export function tidyPromo(code: unknown): string {
  return String(code ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20);
}

export function savedPromo(): string {
  try {
    return tidyPromo(localStorage.getItem(KEY));
  } catch {
    return '';
  }
}

export function savePromo(code: string): void {
  try {
    localStorage.setItem(KEY, tidyPromo(code));
  } catch {
    /* private mode: they can type it at checkout */
  }
}

export function forgetPromo(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing saved */
  }
}

/** If the address has ?promo=CODE, remembers it and tidies the address. Returns the code. */
export function rememberPromoFromLink(): string | null {
  const url = new URL(location.href);
  const code = tidyPromo(url.searchParams.get('promo'));
  if (!url.searchParams.has('promo')) return null;
  url.searchParams.delete('promo');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  if (!code) return null;
  savePromo(code);
  return code;
}
