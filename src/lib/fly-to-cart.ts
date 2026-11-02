// When food is added, a round copy of its photo lifts off the dish and arcs
// up into the cart icon at the top, shrinking as it goes; the cart count then
// gives its little nudge. Skipped for people who prefer less motion.

const onScreen = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

/** The cart icon at the top; if they've scrolled past it, the cart bar at the bottom. */
function target(): HTMLElement | null {
  const top = Array.from(document.querySelectorAll<HTMLElement>('[data-fly-target]')).find(onScreen);
  if (top) return top;
  return Array.from(document.querySelectorAll<HTMLElement>('[data-fly-fallback]')).find(onScreen) ?? null;
}

export function flyToCart(source: HTMLElement | null): void {
  if (!source || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const to = target();
  if (!to) return;
  const from = source.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  if (!from.width || !end.width) return;

  const size = Math.min(from.width, from.height, 96);
  const fly = source.cloneNode(true) as HTMLElement;
  fly.removeAttribute('id');
  fly.setAttribute('aria-hidden', 'true');
  fly.querySelectorAll('img').forEach((img) => img.classList.add('is-loaded'));
  Object.assign(fly.style, {
    position: 'fixed',
    left: `${from.left + from.width / 2 - size / 2}px`,
    top: `${from.top + from.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    margin: '0',
    borderRadius: '999px',
    overflow: 'hidden',
    zIndex: '90',
    pointerEvents: 'none',
    boxShadow: '0 0 0 3px var(--color-surface), 0 12px 28px -8px rgb(0 0 0 / 0.45)',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(fly);

  const dx = end.left + end.width / 2 - (from.left + from.width / 2);
  const dy = end.top + end.height / 2 - (from.top + from.height / 2);
  // Rises a little first, then curves into the icon
  const lift = Math.min(90, Math.abs(dy) * 0.35 + 40);
  const anim = fly.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - lift}px) scale(0.75)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.18)`, opacity: 0.6 },
    ],
    { duration: 750, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
  );
  anim.finished
    .then(() => {
      fly.remove();
      // The cart icon catches it
      to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
    })
    .catch(() => fly.remove());
}
