// Opens the shared overlays (cart, sign in, delivery area) from anywhere.
// Any element with data-open="cart" | "auth" | "location" opens that overlay
// instead of following its link. The link still works if scripts fail.

export type OverlayName = 'cart' | 'auth' | 'location';

const IDS: Record<OverlayName, string> = {
  cart: 'cart-drawer',
  auth: 'auth-modal',
  location: 'location-modal',
};

export function openOverlay(name: OverlayName, opts: { next?: string; reason?: string } = {}): void {
  const dialog = document.getElementById(IDS[name]) as HTMLDialogElement | null;
  if (!dialog) return;
  // Sign-in: where to go afterwards, and why we're asking
  if (opts.next) dialog.dataset.next = opts.next;
  else delete dialog.dataset.next;
  if (opts.reason) dialog.dataset.reason = opts.reason;
  else delete dialog.dataset.reason;
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((d) => d.close());
  dialog.dispatchEvent(new CustomEvent('overlay:open'));
  dialog.showModal();
}

export function bindOverlays(): void {
  document.addEventListener('click', (e) => {
    const trigger = (e.target as Element | null)?.closest<HTMLElement>('[data-open]');
    if (!trigger) return;
    const name = trigger.dataset.open as OverlayName;
    if (!(name in IDS)) return;
    e.preventDefault();
    let next: string | undefined;
    try {
      next = new URL((trigger as HTMLAnchorElement).href).searchParams.get('next') ?? undefined;
    } catch {
      next = undefined;
    }
    openOverlay(name, { next });
  });

  // Close any overlay by tapping the blurred background or a [data-close] button
  document.querySelectorAll<HTMLDialogElement>('dialog.sheet, dialog.drawer').forEach((dialog) => {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
      if ((e.target as Element).closest('[data-close]')) dialog.close();
    });
  });

  // Links like /?signin=1 or /?cart=1 open the overlay on arrival
  const params = new URLSearchParams(window.location.search);
  if (params.get('signin') === '1') openOverlay('auth');
  else if (params.get('cart') === '1') openOverlay('cart');
  else if (params.get('area') === '1') openOverlay('location');
}
