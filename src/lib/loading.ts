// Loading states for the whole app:
// - photos fade in once loaded (their frame shows a skeleton until then)
// - a thin bar across the top while the next page loads
// - the button you pressed shows a spinner while its form is sent

import { hideSkeleton, showSkeleton, skeletonFor } from './skeleton';

function markLoaded(img: HTMLImageElement): void {
  img.classList.add('is-loaded');
  if (img.naturalWidth === 0 && img.complete) img.classList.add('is-broken');
}

function bindImages(): void {
  document.querySelectorAll<HTMLImageElement>('.img-frame > img').forEach((img) => {
    if (img.complete) markLoaded(img);
  });
  // load and error don't bubble, but they can be caught on the way down
  document.addEventListener('load', (e) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLImageElement && t.parentElement?.classList.contains('img-frame')) markLoaded(t);
  }, true);
  document.addEventListener('error', (e) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLImageElement && t.parentElement?.classList.contains('img-frame')) {
      t.classList.add('is-loaded', 'is-broken');
    }
  }, true);
}

function bindProgressBar(): void {
  const bar = document.getElementById('nav-progress');
  if (!bar) return;
  let skeletonTimer = 0;
  const start = (destination?: string) => {
    bar.classList.remove('is-done');
    void bar.offsetWidth;
    bar.classList.add('is-active');
    // Only when the next page is slow: its outline fades in softly. Normal page
    // changes go straight to the new page, with no outline in between.
    if (destination) {
      window.clearTimeout(skeletonTimer);
      skeletonTimer = window.setTimeout(() => showSkeleton(skeletonFor(destination)), 1200);
    }
  };
  const stop = () => {
    window.clearTimeout(skeletonTimer);
    hideSkeleton();
    if (!bar.classList.contains('is-active')) return;
    bar.classList.remove('is-active');
    bar.classList.add('is-done');
  };

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.open) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // same-page jump
    // Let other handlers (back button, pop-ups) decide first
    setTimeout(() => {
      if (!e.defaultPrevented || a.hasAttribute('data-back')) start(url.pathname);
    }, 0);
  });

  document.addEventListener('submit', (e) => {
    setTimeout(() => {
      if (!e.defaultPrevented) start();
    }, 0);
  });

  // Coming back with the browser's back button restores the old page: reset
  window.addEventListener('pageshow', stop);
  window.addEventListener('pagehide', stop);
}

function bindBusyButtons(): void {
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    const button = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    // Wait until the page's own handlers have run; forms handled in the page stay as they are
    setTimeout(() => {
      if (e.defaultPrevented || !button || !button.classList.contains('btn')) return;
      button.setAttribute('aria-busy', 'true');
    }, 0);
    void form;
  });
  window.addEventListener('pageshow', () => {
    document.querySelectorAll('.btn[aria-busy="true"]').forEach((b) => b.removeAttribute('aria-busy'));
  });
}

export function bindLoadingStates(): void {
  bindImages();
  bindProgressBar();
  bindBusyButtons();
}
