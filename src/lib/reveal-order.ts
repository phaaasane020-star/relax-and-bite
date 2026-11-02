// Every page's content appears in reading order: the title, then the text,
// then the buttons, cards and fields, one after another with a soft fade and
// rise. Things further down the page do the same as they scroll into view.
//
// It works on the blocks people read (headings, paragraphs, buttons, cards,
// list items, fields, pictures) inside the page's content area, never on the
// header or tab bar. A small script in the page head hides the content until
// this has run (html.order-pending), with a CSS safety net in case it never does.
//
// Skipped for the panels' quiet auto-refresh, pages restored from history,
// and for people whose phone asks for less motion.

const ROOTS = "[data-motion='page'], [data-refresh-area]";
/** Blocks that appear as one piece (their insides come with them) */
const UNIT = [
  'h1', 'h2', 'h3', 'h4', 'p', 'li', 'label', 'img', 'table', 'dl', 'fieldset', 'figure', 'blockquote', 'hr', 'nav', 'details',
  '.btn', '.chip', '.card', '.food-card', '.badge', '.field-input', '.town-tile', '.welcome-hero', '[data-order-unit]',
  'a', 'button', 'input', 'select', 'textarea', 'svg', 'canvas',
].join(',');
/** Left alone: they animate on their own, or must never move */
const SKIP = [
  'script', 'style', 'template', 'dialog', 'noscript', '[hidden]', '.fixed', '.sticky', '.cs-native',
  '.food-in', '.stagger', '[data-no-order]', '.sr-only', '#ptr-skeleton',
].join(',');
const STEP = 55; // ms between one block and the next
const MAX_STEPS = 12; // the last ones come together, so nothing waits long
const MAX_UNITS = 80;

function collect(root: Element, out: HTMLElement[]): void {
  for (const child of Array.from(root.children)) {
    if (out.length >= MAX_UNITS) return;
    if (!(child instanceof HTMLElement) && !(child instanceof SVGElement)) continue;
    if (child.matches(SKIP)) continue;
    // A block with its own words (not just other blocks inside) also appears as one piece
    const ownText = Array.from(child.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
    if (child.matches(UNIT) || ownText) {
      out.push(child as HTMLElement);
      continue;
    }
    collect(child, out);
  }
}

function visibleSize(el: Element): DOMRect | null {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

function run(): void {
  const html = document.documentElement;
  const units: HTMLElement[] = [];
  document.querySelectorAll(ROOTS).forEach((root) => collect(root, units));

  let step = 0;
  const below: HTMLElement[] = [];
  for (const el of units) {
    const r = visibleSize(el);
    if (!r) continue;
    if (r.top < window.innerHeight) {
      el.style.setProperty('--o', String(Math.min(step++, MAX_STEPS)));
      el.classList.add('o-in');
    } else {
      el.classList.add('o-wait');
      below.push(el);
    }
  }
  html.classList.remove('order-pending');

  // Further down: each group that scrolls into view appears in order too
  if (below.length && 'IntersectionObserver' in window) {
    let batch = 0;
    let batchTimer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          io.unobserve(el);
          el.style.setProperty('--o', String(Math.min(batch++, 6)));
          el.classList.remove('o-wait');
          el.classList.add('o-in');
        }
        window.clearTimeout(batchTimer);
        batchTimer = window.setTimeout(() => (batch = 0), 120);
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    below.forEach((el) => io.observe(el));
  } else {
    below.forEach((el) => el.classList.remove('o-wait'));
  }
}

export function bindRevealOrder(): void {
  const html = document.documentElement;
  if (!html.classList.contains('order-pending')) return;
  const start = () => requestAnimationFrame(run);

  // After a refresh, wait for the loading outline to lift
  if (html.classList.contains('is-reloading') && !html.classList.contains('revealed')) {
    const watch = new MutationObserver(() => {
      if (html.classList.contains('revealed')) {
        watch.disconnect();
        start();
      }
    });
    watch.observe(html, { attributes: true, attributeFilter: ['class'] });
    return;
  }
  start();

  // Coming back from history shows the page as it was
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      html.classList.remove('order-pending');
      document.querySelectorAll('.o-wait').forEach((el) => el.classList.remove('o-wait'));
    }
  });
}

/** Runs in <head>: hides the content until it can appear in order. */
export const ORDER_GATE = `(function(){var d=document.documentElement;try{if(d.classList.contains('was-quiet')||matchMedia('(prefers-reduced-motion: reduce)').matches)return}catch(e){return}d.classList.add('order-pending')})();`;
