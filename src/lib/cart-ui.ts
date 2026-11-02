// Draws cart lines with quantity steppers. Used by the cart drawer and /cart.
import { setQty, type Cart } from './cart';
import { money } from './format';

const ICON = {
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};

function svg(path: string): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function renderCartLines(list: HTMLElement, cart: Cart | null): void {
  list.replaceChildren();
  if (!cart) return;

  for (const line of cart.lines) {
    const li = document.createElement('li');
    li.className = 'flex gap-3 py-4';

    // The photo sits on the dish drawing, which shows while it loads (or if there's none)
    const frame = document.createElement('span');
    frame.className = 'food-sketch size-16 rounded-xl shrink-0';
    if (line.image) {
      const img = document.createElement('img');
      img.src = line.image;
      img.alt = '';
      img.decoding = 'async';
      img.className = 'size-full object-cover';
      img.addEventListener('error', () => img.remove());
      frame.append(img);
    }
    li.append(frame);

    const info = document.createElement('div');
    info.className = 'flex-1 min-w-0 flex flex-col gap-1';
    const name = document.createElement('span');
    name.className = 'font-bold leading-snug';
    name.textContent = line.name;
    info.append(name);
    if (line.options.length) {
      const opts = document.createElement('span');
      opts.className = 'text-sm text-muted';
      opts.textContent = line.options.map((o) => o.choice).join(', ');
      info.append(opts);
    }
    const price = document.createElement('span');
    price.className = 'text-[0.9375rem] font-bold tabular';
    price.textContent = money(line.unitPrice * line.qty);
    info.append(price);

    const stepper = document.createElement('div');
    stepper.className = 'self-center flex items-center h-10 rounded-full border border-line-strong shrink-0';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'size-10 flex items-center justify-center';
    minus.setAttribute('aria-label', line.qty === 1 ? `Remove ${line.name}` : `One less ${line.name}`);
    minus.innerHTML = svg(line.qty === 1 ? ICON.trash : ICON.minus);
    minus.addEventListener('click', () => setQty(line.key, line.qty - 1));

    const count = document.createElement('span');
    count.className = 'min-w-5 text-center font-bold tabular';
    count.textContent = String(line.qty);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'size-10 flex items-center justify-center text-brand';
    plus.setAttribute('aria-label', `One more ${line.name}`);
    plus.innerHTML = svg(ICON.plus);
    plus.addEventListener('click', () => setQty(line.key, line.qty + 1));

    stepper.append(minus, count, plus);
    li.append(info, stepper);
    list.append(li);
  }
}
