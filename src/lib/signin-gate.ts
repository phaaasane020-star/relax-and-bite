// Guests can look around, but ordering and favourites need an account.
// Tapping checkout or a save button while signed out opens the sign-in popup
// instead, and carries on to checkout once they've signed in.
// (The server also refuses orders from guests, so this is just the friendly part.)
import { openOverlay } from './overlays';

const signedIn = () => document.documentElement.dataset.user === '1';

export function bindSignInGate(): void {
  if (signedIn()) return;
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element | null;
      const checkout = target?.closest<HTMLAnchorElement>('a[href="/checkout"], a[href^="/checkout?"]');
      const save = target?.closest<HTMLButtonElement>('button[data-fav]');
      if (!checkout && !save) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (checkout) openOverlay('auth', { next: '/checkout', reason: 'Sign in or create an account to place your order.' });
      else openOverlay('auth', { reason: 'Sign in or create an account to save your favourites.' });
    },
    true,
  );
}
