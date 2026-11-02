// In the app, dragging with a mouse scrolls the page like a finger does, with
// a little momentum when you let go. Phones never need this (they send touches),
// but the Android emulator on a computer sends mouse events, and a mouse drag
// would otherwise select text instead of scrolling.
// Sideways drags scroll rows that scroll sideways (area chips, food types).

const SKIP = 'select, option, [contenteditable], [data-no-drag-scroll], dialog, input[type="range"]';

function sidewaysScroller(el: Element | null): HTMLElement | null {
  for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowX;
    if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth) return n;
  }
  return null;
}

export function bindDragScroll(): void {
  const root = document.documentElement;
  if (!root.classList.contains('in-app')) return;

  let down = false;
  let dragging = false;
  let axis: 'x' | 'y' | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0; // px per ms, for the momentum
  let row: HTMLElement | null = null;
  let glide = 0;

  const stopGlide = () => cancelAnimationFrame(glide);

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    if (target?.closest(SKIP) || document.querySelector('dialog[open]')) return;
    stopGlide();
    down = true;
    dragging = false;
    axis = null;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    lastT = performance.now();
    velocity = 0;
    row = sidewaysScroller(target);
  });

  window.addEventListener('mousemove', (e) => {
    if (!down || (e.buttons & 1) === 0) {
      down = false;
      return;
    }
    // Pull to refresh is handling this drag
    if (root.classList.contains('is-pulling-page')) return;
    if (!dragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) < 6) return; // a click, not a drag
      axis = Math.abs(dx) > Math.abs(dy) && row ? 'x' : 'y';
      // Pulling down at the very top belongs to pull to refresh
      if (axis === 'y' && dy > 0 && window.scrollY <= 0) {
        down = false;
        return;
      }
      dragging = true;
      root.classList.add('is-drag-scrolling');
    }
    e.preventDefault(); // no text selection while dragging
    const now = performance.now();
    if (axis === 'x' && row) {
      const step = e.clientX - lastX;
      row.scrollLeft -= step;
    } else {
      const step = e.clientY - lastY;
      window.scrollBy(0, -step);
      const dt = Math.max(1, now - lastT);
      velocity = 0.8 * (step / dt) + 0.2 * velocity;
    }
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
  });

  window.addEventListener('mouseup', () => {
    if (!down) return;
    down = false;
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-drag-scrolling');
    // The drag shouldn't also count as a tap on whatever was under it
    window.addEventListener('click', (ev) => ev.preventDefault(), { capture: true, once: true });
    // Let the page glide on a little, slowing down like a finger flick
    if (axis !== 'y' || performance.now() - lastT > 80) return;
    let v = velocity * 16; // px per frame
    const step = () => {
      if (Math.abs(v) < 0.5) return;
      window.scrollBy(0, -v);
      v *= 0.94;
      glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  });

  // Touching or scrolling again stops the glide
  window.addEventListener('wheel', stopGlide, { passive: true });
  window.addEventListener('touchstart', stopGlide, { passive: true });
}
