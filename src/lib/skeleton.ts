// The page skeleton: an outline of the screen shown while a fresh copy loads.
//
// It shows on every refresh: when you pull down, press F5, tap reload, or the
// app reopens the page. A small script in the page head marks the refresh
// before anything is drawn (html.is-reloading), so the skeleton is the first
// thing you see; once the page and its first photos are ready it fades out
// slowly and the content settles in underneath.
//
// The panels' automatic refresh (every 20-30 seconds) is a quiet refresh: no
// skeleton, just a soft light across the top bar, so the board never flashes.

/** One outline per kind of screen */
export const SKELETON_KINDS = ['home', 'vendor', 'list', 'order', 'account', 'checkout', 'form', 'legal', 'panel'] as const;
export type SkeletonKind = (typeof SKELETON_KINDS)[number];

/** Which outline a page uses, from its address. Used on the server (refresh)
 *  and in the browser (the page a tapped link goes to). */
export function skeletonFor(path: string): SkeletonKind {
  const p = path.replace(/\/+$/, '') || '/';
  const under = (base: string) => p === base || p.startsWith(`${base}/`);
  if (p === '/') return 'home';
  if (under('/vendors')) return 'vendor';
  if (/^\/orders\/[^/]+$/.test(p)) return 'order';
  if (under('/vendor') || under('/rider') || under('/admin')) return 'panel';
  if (['/orders', '/favourites', '/search', '/cart'].includes(p)) return 'list';
  if (p === '/account') return 'account';
  if (p === '/checkout') return 'checkout';
  if (['/privacy', '/terms', '/help'].includes(p)) return 'legal';
  if (under('/partner') || under('/welcome') || ['/login', '/verify', '/location'].includes(p)) return 'form';
  return 'home';
}

const ID = 'ptr-skeleton';
const QUIET_KEY = 'rb_quiet_reload';
const PULLED_KEY = 'rb_pulled';
/** Set when a link is tapped: forward, back, or tab (switching tabs) */
export const NAV_KEY = 'rb_nav_dir';

/**
 * Runs in <head> before the page is drawn. Kept tiny and dependency-free.
 * - refresh, and the first page when the app or site is opened (usually the
 *   home page): marks html.is-reloading so the outline is the first thing drawn
 * - moving between pages: marks html[data-nav] with the direction, and tells
 *   the browser's page transition which way to slide
 */
export const HEAD_GATE = `(function(){var d=document.documentElement,s;try{s=window.sessionStorage}catch(e){}function take(k){try{var v=s&&s.getItem(k);if(v!==null&&s)s.removeItem(k);return v}catch(e){return null}}var quiet=take('${QUIET_KEY}')==='1',pulled=take('${PULLED_KEY}')==='1',dir=take('${NAV_KEY}'),t='';try{t=performance.getEntriesByType('navigation')[0].type}catch(e){}var first=false;try{first=t==='navigate'&&s&&!s.getItem('rb_opened');if(s)s.setItem('rb_opened','1')}catch(e){}if(quiet){d.classList.add('was-quiet')}else if(t==='reload'||pulled||first){d.classList.add('is-reloading');if(pulled)d.classList.add('was-pulled');if(first)d.classList.add('first-open')}else{if(t==='back_forward')dir='back';if(dir)d.setAttribute('data-nav',dir)}if(!('onpagereveal' in window)){d.classList.add('no-vt');return}addEventListener('pagereveal',function(e){var v=e.viewTransition;if(!v)return;var nav=d.getAttribute('data-nav');try{var a=navigation.activation;if(a&&a.navigationType==='traverse'&&a.from){nav=a.from.index>a.entry.index?'back':'forward';d.setAttribute('data-nav',nav)}}catch(x){}if(!nav||d.classList.contains('was-quiet')||d.classList.contains('is-reloading')){v.skipTransition();return}v.types.add(nav)})})();`;

const el = () => document.getElementById(ID);

/** Swap the outline to another kind of screen (kept as templates in the page). */
function useKind(s: HTMLElement, kind: SkeletonKind): void {
  const current = s.dataset.kind;
  if (current === kind) return;
  const next = document.querySelector<HTMLTemplateElement>(`template[data-skeleton="${kind}"]`);
  if (!next) return;
  // Keep the current outline as a template so it can come back
  if (current && !document.querySelector(`template[data-skeleton="${current}"]`)) {
    const keep = document.createElement('template');
    keep.dataset.skeleton = current;
    keep.content.append(...Array.from(s.childNodes));
    s.after(keep);
  }
  s.replaceChildren(next.content.cloneNode(true));
  s.dataset.kind = kind;
}

/** Show the outline: of this page, or of `kind` (the page a link goes to). */
export function showSkeleton(kind?: SkeletonKind): void {
  const s = el();
  if (!s) return;
  if (kind) useKind(s, kind);
  s.classList.remove('is-leaving');
  s.classList.add('is-shown');
}

export function hideSkeleton(): void {
  el()?.classList.remove('is-shown', 'is-leaving');
}

/** Reload without the skeleton (the panels' automatic refresh). */
export function quietReload(): void {
  try {
    sessionStorage.setItem(QUIET_KEY, '1');
  } catch {
    /* storage unavailable: it just shows the skeleton */
  }
  window.location.reload();
}

/** Reload after a pull, so the new page can carry the bowl on. */
export function pulledReload(): void {
  try {
    sessionStorage.setItem(PULLED_KEY, '1');
  } catch {
    /* fine without it */
  }
  window.location.reload();
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** After a refresh: lift the outline as soon as the page is ready. Photos have
 *  their own shimmering frames, so there's no need to wait for them. */
async function revealAfterReload(): Promise<void> {
  const root = document.documentElement;
  if (!root.classList.contains('is-reloading')) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Just long enough to register as a refresh when the page arrives instantly
  const minimum = reduced ? 0 : 300;
  await wait(Math.max(0, minimum - performance.now()));
  // Opening the app: the intro lifts onto the outline, which stays a moment
  // before the food arrives (like the app is getting the restaurants ready)
  if (root.classList.contains('intro')) {
    await new Promise<void>((done) => {
      window.addEventListener('rb:intro-done', () => done(), { once: true });
      window.setTimeout(done, 9000); // never wait for ever
    });
    // Long enough for the outline to build from the top down and the light to cross once
    await wait(reduced ? 0 : 1000);
  }
  // 'revealed' stays: removing what drives the entrance would make it play again
  root.classList.add('is-revealing', 'revealed');
  await wait(reduced ? 50 : 520);
  root.classList.remove('is-reloading', 'is-revealing', 'was-pulled');
}

export function bindSkeleton(): void {
  void revealAfterReload();

  // F5 / Ctrl+R / Cmd+R: show the outline straight away
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) showSkeleton();
  });

  // Coming back from history restores the old page as it was: clear everything
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    hideSkeleton();
    document.documentElement.classList.remove('is-reloading', 'is-revealing', 'was-pulled', 'was-quiet');
  });
}
