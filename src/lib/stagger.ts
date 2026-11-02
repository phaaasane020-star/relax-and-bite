// Every page's content arrives in order, top to bottom: the heading, then the
// text under it, then each card, list row, field and button, each one rising
// softly into place a moment after the one before. Things further down the
// page wait until you scroll to them, then arrive the same way.
//
// It picks the "blocks" of a page by itself (headings, paragraphs, cards,
// list rows, form fields, buttons, images...), keeping a card's insides
// together with the card. Bars fixed to the screen (tab bar, checkout bar)
// never move. Skipped for the panels' automatic refresh and for people who
// prefer less motion.

const BLOCKS = [
  'h1', 'h2', 'h3', 'p', 'li', 'dl', 'table tr', 'figure', 'img', 'nav',
  '.card', '.food-card', '.btn', '.chip', 'form > div', 'fieldset', 'label', '[data-stagger]',
].join(',');

const STEP = 55; // ms between one block and the next
const MAX_STEPS = 12; // after this many, the rest arrive together
const SKIP = '.fixed, .sticky, dialog, [data-no-stagger], .food-in, template, #ptr-skeleton';

function pickBlocks(root: Element): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS));
  const picked: HTMLElement[] = [];
  for (const el of all) {
    if (el.closest(SKIP)) continue;
    if (el.closest('[hidden]')) continue;
    // Keep a block's insides with the block (a card's title arrives with the card)
    if (el.parentElement?.closest('[data-st]')) continue;
    el.setAttribute('data-st', '');
    picked.push(el);
  }
  return picked;
}

function run(baseDelay: number): void {
  const roots = document.querySelectorAll('[data-motion="page"], [data-refresh-area]');
  const blocks: HTMLElement[] = [];
  roots.forEach((r) => blocks.push(...pickBlocks(r)));
  if (!blocks.length) return;

  const vh = window.innerHeight;
  let step = 0;
  const later: HTMLElement[] = [];
  for (const el of blocks) {
    const top = el.getBoundingClientRect().top;
    if (top < vh * 1.02) {
      el.style.setProperty('--st-d', `${baseDelay + Math.min(step, MAX_STEPS) * STEP}ms`);
      el.classList.add('st-in');
      step++;
    } else {
      el.classList.add('st-wait');
      later.push(el);
    }
  }

  // Further down: arrive in order when they scroll into view
  if (!later.length) return;
  if (!('IntersectionObserver' in window)) {
    later.forEach((el) => el.classList.remove('st-wait'));
    return;
  }
  let batch = 0;
  let batchTimer = 0;
  const io = new IntersectionObserver(
    (entries) => {
      const coming = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
      coming.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      for (const el of coming) {
        io.unobserve(el);
        el.style.setProperty('--st-d', `${Math.min(batch, 6) * STEP}ms`);
        el.classList.remove('st-wait');
        el.classList.add('st-in');
        batch++;
      }
      window.clearTimeout(batchTimer);
      batchTimer = window.setTimeout(() => (batch = 0), 250);
    },
    { rootMargin: '0px 0px -6% 0px' },
  );
  later.forEach((el) => io.observe(el));
  // Never leave anything invisible (very long pages, odd layouts)
  window.setTimeout(() => {
    document.querySelectorAll('.st-wait').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.remove('st-wait');
    });
  }, 4000);
}

export function bindStagger(): void {
  const root = document.documentElement;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (root.classList.contains('was-quiet')) return; // panels' automatic refresh: nothing moves
  root.classList.add('stagger-on');

  // After a page slide-in, start a touch later so the two don't fight
  const base = root.hasAttribute('data-nav') ? 140 : 40;

  // Refresh or first open: wait until the loading outline has lifted
  if (root.classList.contains('is-reloading') && !root.classList.contains('revealed')) {
    const mo = new MutationObserver(() => {
      if (root.classList.contains('revealed')) {
        mo.disconnect();
        run(120);
      }
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    window.setTimeout(() => {
      mo.disconnect();
      if (!document.querySelector('.st-in')) run(0);
    }, 12000);
    return;
  }
  run(base);
}
