// A short guide the first time someone opens Home on a phone: the page dims,
// one part at a time is lit up with a line about what it does, and Next /
// Skip move through it. Shown once per phone; parts that aren't on the page
// (for example no food yet in their town) are left out.

type Step = { target: string; title: string; text: string };

const STEPS: Step[] = [
  { target: '[data-tour="town"]', title: 'Your town', text: 'Tap here to choose where your food is delivered. You only see restaurants in this town.' },
  { target: '[data-tour="search"]', title: 'Find food fast', text: 'Search for a dish like jollof or waakye, or for a restaurant by name.' },
  { target: '.dish-add', title: 'Add to your order', text: 'Tap + on any food to add it. You can choose extras like protein or drinks.' },
  { target: '[data-tour="cart"]', title: 'Your bag', text: 'Everything you add waits here. Open it to check out and pay with Mobile Money.' },
  { target: '[data-tour="tab-orders"]', title: 'Track your food', text: 'See your order move from the kitchen to the rider to your door, live.' },
  { target: '[data-tour="tab-account"]', title: 'Your account', text: 'Your details, notifications, help and support are all here.' },
];

const DONE_KEY = 'rb_tour_done';

const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
};

export function startTour(force = false): void {
  try {
    if (!force && localStorage.getItem(DONE_KEY)) return;
  } catch {
    return; // no storage: don't risk showing it on every visit
  }
  // Phones only (on a computer everything is in view already)
  if (!force && !matchMedia('(max-width: 767px)').matches) return;

  const steps = STEPS.map((s) => ({ ...s, el: document.querySelector(s.target) })).filter((s) => visible(s.el)) as (Step & { el: HTMLElement })[];
  if (steps.length < 2) return;

  const finish = () => {
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* fine */
    }
    layer.remove();
    window.removeEventListener('resize', place);
    document.documentElement.classList.remove('touring');
  };

  // The dim layer with a hole over the part being explained, and the card
  const layer = document.createElement('div');
  layer.className = 'tour';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', 'Quick guide');
  layer.innerHTML = `
    <div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-card">
      <p class="tour-count"></p>
      <h2 class="tour-title"></h2>
      <p class="tour-text"></p>
      <div class="tour-actions">
        <button type="button" class="tour-skip">Skip</button>
        <button type="button" class="btn btn-primary tour-next">Next</button>
      </div>
    </div>`;
  document.body.append(layer);
  document.documentElement.classList.add('touring');

  const hole = layer.querySelector<HTMLElement>('.tour-hole')!;
  const card = layer.querySelector<HTMLElement>('.tour-card')!;
  const count = layer.querySelector<HTMLElement>('.tour-count')!;
  const title = layer.querySelector<HTMLElement>('.tour-title')!;
  const text = layer.querySelector<HTMLElement>('.tour-text')!;
  const next = layer.querySelector<HTMLButtonElement>('.tour-next')!;
  let i = 0;

  function place() {
    const step = steps[i]!;
    const r = step.el.getBoundingClientRect();
    const pad = 6;
    hole.style.left = `${r.left - pad}px`;
    hole.style.top = `${r.top - pad}px`;
    hole.style.width = `${r.width + pad * 2}px`;
    hole.style.height = `${r.height + pad * 2}px`;
    hole.style.borderRadius = getComputedStyle(step.el).borderRadius === '0px' ? '14px' : `calc(${getComputedStyle(step.el).borderRadius} + ${pad}px)`;
    // Card below the part, or above it when the part is low on the screen
    const below = r.bottom + 16;
    const cardH = card.offsetHeight;
    const roomBelow = window.innerHeight - below;
    card.style.top = roomBelow > cardH + 12 ? `${below}px` : `${Math.max(12, r.top - 16 - cardH)}px`;
  }

  function show() {
    const step = steps[i]!;
    // Bring it into view first (the food row can be further down)
    const r = step.el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 90) step.el.scrollIntoView({ block: 'center' });
    count.textContent = `${i + 1} of ${steps.length}`;
    title.textContent = step.title;
    text.textContent = step.text;
    next.textContent = i === steps.length - 1 ? 'Got it' : 'Next';
    requestAnimationFrame(place);
  }

  next.addEventListener('click', () => {
    if (i < steps.length - 1) {
      i++;
      show();
    } else {
      finish();
      window.scrollTo({ top: 0 });
    }
  });
  layer.querySelector('.tour-skip')!.addEventListener('click', finish);
  layer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') finish();
  });
  window.addEventListener('resize', place);
  show();
}

/** Starts the guide once the intro (if any) and the page have settled. */
export function bindTour(): void {
  // Account > "How the app works" opens Home with ?tour=1 to see it again
  const again = new URLSearchParams(location.search).get('tour') === '1';
  if (again) history.replaceState(history.state, '', location.pathname);
  const go = () => window.setTimeout(() => startTour(again), 700);
  if (document.documentElement.classList.contains('intro')) window.addEventListener('rb:intro-done', go, { once: true });
  else go();
}
