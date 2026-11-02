// Moving between pages slides gently from the side and fades:
// - going forward (a link or button to a new page): the new page comes in from the right
// - going back (the back arrow, or the phone's back button): it comes in from the left
// - switching tabs in the bottom bar: a slow cross-fade, no slide
//
// Newer phones and browsers do this with the built-in page transition (the old
// page slides out while the new one slides in, header and tab bar stay put).
// Older Android WebViews get the same feel with CSS on the new page, while the
// old page is held on screen (no fading out first, which made it blink).
// The direction is worked out here when a link is tapped and read by the
// small script in the page head (see HEAD_GATE in skeleton.ts).

import { NAV_KEY } from './skeleton';

type Direction = 'forward' | 'back' | 'tab';

function remember(dir: Direction): void {
  try {
    sessionStorage.setItem(NAV_KEY, dir);
  } catch {
    /* storage unavailable: pages just fade */
  }
}

function directionFor(link: HTMLAnchorElement): Direction {
  if (link.hasAttribute('data-back')) return 'back';
  if (link.dataset.nav === 'back' || link.dataset.nav === 'tab') return link.dataset.nav;
  if (link.closest('.vt-tabbar, .vt-sidebar')) return 'tab';
  return 'forward';
}

export function bindPageTransitions(): void {
  // Capture phase: runs before other click handlers (the back arrow calls history.back())
  document.addEventListener(
    'click',
    (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.dataset.open) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page
      // The page you're on stays exactly as it is until the next one is ready,
      // so nothing blinks; the next page reads this to know which side to come from
      remember(directionFor(link));
    },
    true,
  );

  // Sending a form to another page counts as going forward
  document.addEventListener('submit', (e) => {
    window.setTimeout(() => {
      if (!e.defaultPrevented) remember('forward');
    }, 0);
  });

  // data-nav stays on the page: taking it off would restart the entrance animation
}
