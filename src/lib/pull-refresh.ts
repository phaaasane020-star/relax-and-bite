// Pull down from the top of any page to refresh (phones and the Android app).
// A small circle comes down with your finger and its ring fills; let go past the line and
// the page reloads, with a skeleton of the page while the fresh one arrives.

import { hideSkeleton, pulledReload, showSkeleton } from './skeleton';

const THRESHOLD = 72; // px of pull needed to refresh
const MAX = 128; // furthest the bowl travels

export function bindPullToRefresh(): void {
  const ptr = document.getElementById('ptr');
  const status = document.getElementById('ptr-status');
  if (!ptr) return;
  // Phones and the Android app (touch), plus a mouse drag on phone-sized screens
  // (the emulator and Chrome's phone view report a mouse instead of touch)
  const touchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const phoneSized = () => window.matchMedia('(max-width: 767px)').matches;
  if (!touchCapable && !phoneSized()) return;

  // Our own pull replaces the browser's, so they don't both fire
  document.documentElement.classList.add('has-ptr');

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let active = false;
  let distance = 0;
  let refreshing = false;

  const set = (d: number) => {
    distance = d;
    const progress = Math.min(1, d / THRESHOLD);
    ptr.style.setProperty('--pull', String(d));
    ptr.style.setProperty('--progress', progress.toFixed(3));
    const ready = d >= THRESHOLD;
    if (ready !== ptr.classList.contains('is-ready')) {
      ptr.classList.toggle('is-ready', ready);
      if (status) status.textContent = ready ? 'Release to refresh' : '';
      if (ready) {
        try {
          navigator.vibrate?.(10);
        } catch {
          /* not supported */
        }
      }
    }
  };

  const reset = () => {
    active = false;
    tracking = false;
    ptr.classList.remove('is-pulling', 'is-ready');
    ptr.classList.add('is-settling');
    set(0);
    window.setTimeout(() => ptr.classList.remove('is-settling'), 260);
  };

  const refresh = () => {
    refreshing = true;
    ptr.classList.remove('is-pulling', 'is-ready');
    ptr.classList.add('is-refreshing', 'is-settling');
    ptr.style.setProperty('--pull', String(THRESHOLD));
    ptr.style.setProperty('--progress', '1');
    if (status) status.textContent = 'Refreshing';
    showSkeleton();
    // Give the animation a moment to be seen, then load the fresh page
    window.setTimeout(pulledReload, 420);
  };

  const blocked = () =>
    refreshing ||
    window.scrollY > 0 ||
    document.querySelector('dialog[open]') !== null ||
    document.documentElement.classList.contains('no-ptr');

  const begin = (x: number, y: number, target: EventTarget | null): void => {
    if (blocked()) return;
    // Not when starting inside a box you type in, or something marked as its own scroller
    const el = target as Element | null;
    if (el?.closest?.('[data-no-ptr], input, textarea, select')) return;
    startX = x;
    startY = y;
    tracking = true;
    active = false;
  };

  /** Returns true when the pull is ours (so the page shouldn't also scroll). */
  const move = (x: number, y: number): boolean => {
    if (!tracking) return false;
    const dx = x - startX;
    const dy = y - startY;
    if (!active) {
      if (Math.abs(dx) > Math.abs(dy) || dy < 0) {
        tracking = false; // a sideways swipe or a scroll up: not ours
        return false;
      }
      if (dy < 8 || window.scrollY > 0) return false;
      active = true;
      ptr.classList.add('is-pulling');
      document.documentElement.classList.add('is-pulling-page');
    }
    // Resistance: the further you pull, the slower it follows
    const eased = MAX * (1 - Math.exp(-(dy - 8) / (MAX * 1.4)));
    set(Math.max(0, eased));
    return true;
  };

  const end = (): void => {
    document.documentElement.classList.remove('is-pulling-page');
    if (!tracking && !active) return;
    if (active && distance >= THRESHOLD) refresh();
    else if (active) reset();
    tracking = false;
  };

  // Touch (phones, the Android app)
  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target);
    },
    { passive: true },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      if (move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', () => {
    document.documentElement.classList.remove('is-pulling-page');
    if (active) reset();
    tracking = false;
  });

  // Mouse drag, only on phone-sized screens (emulator, Chrome's phone view)
  let mouseDown = false;
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !phoneSized()) return;
    mouseDown = true;
    begin(e.clientX, e.clientY, e.target);
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    if (move(e.clientX, e.clientY)) e.preventDefault(); // no text selection while pulling
  });
  window.addEventListener('mouseup', () => {
    if (!mouseDown) return;
    mouseDown = false;
    const wasPull = active;
    end();
    // A drag that pulled shouldn't also count as a click on whatever was under it
    if (wasPull) {
      window.addEventListener('click', (ev) => ev.preventDefault(), { capture: true, once: true });
    }
  });

  // Coming back to a page from the browser history: start clean
  window.addEventListener('pageshow', () => {
    refreshing = false;
    hideSkeleton();
    ptr.classList.remove('is-refreshing', 'is-pulling', 'is-ready');
    set(0);
  });
}
