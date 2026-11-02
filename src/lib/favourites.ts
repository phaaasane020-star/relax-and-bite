// Browser-only favourites (restaurants and dishes), saved on this device.
// The backend step can sync these to the customer's account.

type Favs = { vendors: string[]; items: string[] };
const KEY = 'rb_favourites_v1';
const EVENT = 'rb:favourites';

export function getFavs(): Favs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Favs>;
    return { vendors: Array.isArray(v.vendors) ? v.vendors : [], items: Array.isArray(v.items) ? v.items : [] };
  } catch {
    return { vendors: [], items: [] };
  }
}

function save(f: Favs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function toggleFav(kind: 'vendor' | 'item', id: string): boolean {
  const f = getFavs();
  const list = kind === 'vendor' ? f.vendors : f.items;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.unshift(id);
  save(f);
  return i < 0;
}

export function isFav(kind: 'vendor' | 'item', id: string, f: Favs = getFavs()): boolean {
  return (kind === 'vendor' ? f.vendors : f.items).includes(id);
}

export function onFavChange(cb: (f: Favs) => void): void {
  const run = () => cb(getFavs());
  window.addEventListener(EVENT, run);
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) run();
  });
  run();
}

/**
 * Every <button data-fav="vendor|item" data-fav-id="..." data-fav-name="..."> becomes a save toggle.
 * aria-pressed shows the state; CSS fills the bookmark when pressed.
 */
export function bindFavButtons(onToggle?: (saved: boolean, name: string) => void): void {
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('button[data-fav]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const saved = toggleFav(btn.dataset.fav as 'vendor' | 'item', btn.dataset.favId!);
    if (saved) {
      btn.classList.remove('is-popping');
      void btn.offsetWidth; // restart the animation
      btn.classList.add('is-popping');
      btn.addEventListener('animationend', () => btn.classList.remove('is-popping'), { once: true });
    }
    onToggle?.(saved, btn.dataset.favName ?? '');
  });
  onFavChange((f) => {
    document.querySelectorAll<HTMLButtonElement>('button[data-fav]').forEach((btn) => {
      const on = isFav(btn.dataset.fav as 'vendor' | 'item', btn.dataset.favId!, f);
      btn.setAttribute('aria-pressed', String(on));
      const name = btn.dataset.favName ?? '';
      btn.setAttribute('aria-label', on ? `Remove ${name} from favourites` : `Save ${name} to favourites`);
    });
  });
}
