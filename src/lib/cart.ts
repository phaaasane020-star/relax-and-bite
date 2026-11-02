// Browser-only cart, saved in localStorage. One restaurant per cart.
// Prices here are for display; the server recalculates everything at checkout.

export type CartOption = { group: string; choice: string; price: number };

export type CartLine = {
  key: string; // item id + chosen options, so different choices stay separate
  itemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  options: CartOption[];
  image: string | null;
};

export type Cart = {
  vendorId: string;
  vendorSlug: string;
  vendorName: string;
  /** The restaurant's delivery fee when the food was added (for display; checkout uses the current one) */
  deliveryFee?: number;
  lines: CartLine[];
};

export type CartVendor = Pick<Cart, 'vendorId' | 'vendorSlug' | 'vendorName' | 'deliveryFee'>;

const KEY = 'rb_cart_v1';
const EVENT = 'rb:cart';

export function getCart(): Cart | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const cart = JSON.parse(raw) as Cart;
    return cart && Array.isArray(cart.lines) && cart.lines.length ? cart : null;
  } catch {
    return null;
  }
}

function save(cart: Cart | null): void {
  try {
    if (!cart || cart.lines.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    /* storage unavailable: cart lives for this page only */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function lineKey(itemId: string, options: CartOption[]): string {
  const opts = options
    .map((o) => `${o.group}:${o.choice}`)
    .sort()
    .join('|');
  return opts ? `${itemId}#${opts}` : itemId;
}

/** Returns 'conflict' when the cart holds food from another restaurant. */
export function addLine(vendor: CartVendor, line: Omit<CartLine, 'key'>, replace = false): 'added' | 'conflict' {
  let cart = getCart();
  if (cart && cart.vendorId !== vendor.vendorId) {
    if (!replace) return 'conflict';
    cart = null;
  }
  if (!cart) cart = { ...vendor, lines: [] };
  if (vendor.deliveryFee !== undefined) cart.deliveryFee = vendor.deliveryFee;

  const key = lineKey(line.itemId, line.options);
  const existing = cart.lines.find((l) => l.key === key);
  if (existing) existing.qty = Math.min(50, existing.qty + line.qty);
  else cart.lines.push({ ...line, key });
  save(cart);
  return 'added';
}

export function setQty(key: string, qty: number): void {
  const cart = getCart();
  if (!cart) return;
  if (qty <= 0) cart.lines = cart.lines.filter((l) => l.key !== key);
  else {
    const line = cart.lines.find((l) => l.key === key);
    if (line) line.qty = Math.min(50, qty);
  }
  save(cart);
}

export function clearCart(): void {
  save(null);
}

export function cartCount(cart: Cart | null = getCart()): number {
  return cart ? cart.lines.reduce((n, l) => n + l.qty, 0) : 0;
}

export function cartSubtotal(cart: Cart | null = getCart()): number {
  return cart ? cart.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0) : 0;
}

export function qtyOfItem(itemId: string, cart: Cart | null = getCart()): number {
  return cart ? cart.lines.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.qty, 0) : 0;
}

/** Run now and whenever the cart changes (this tab or another). */
export function onCartChange(cb: (cart: Cart | null) => void): void {
  const run = () => cb(getCart());
  window.addEventListener(EVENT, run);
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) run();
  });
  run();
}

/** Keep every [data-cart-count] badge on the page up to date. */
export function bindCartBadges(): void {
  let last: number | null = null;
  onCartChange((cart) => {
    const n = cartCount(cart);
    const grew = last !== null && n > last;
    last = n;
    document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => {
      el.textContent = String(n);
      el.hidden = n === 0;
      if (grew) {
        el.classList.remove('is-bumping');
        void el.offsetWidth; // restart the animation
        el.classList.add('is-bumping');
      }
    });
  });
}
