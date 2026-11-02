// An eye button inside every password box: tap to see what you typed, tap
// again to hide it. Added to every password field on every page.

const EYE = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF =
  '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
const svg = (paths: string) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export function bindPasswordEyes(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[type="password"]:not([data-eye])').forEach((input) => {
    input.dataset.eye = '';
    // Put the box in a wrapper so the eye can sit inside it on the right
    let wrap = input.parentElement!;
    if (!wrap.hasAttribute('data-eye-wrap')) {
      wrap = document.createElement('div');
      wrap.setAttribute('data-eye-wrap', '');
      wrap.className = 'relative';
      input.replaceWith(wrap);
      wrap.append(input);
    }
    input.classList.add('pr-12');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'absolute right-1 top-1/2 -translate-y-1/2 size-10 rounded-lg flex items-center justify-center text-muted hover:text-ink focus-visible:text-ink';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = svg(EYE);
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = svg(show ? EYE_OFF : EYE);
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(show));
      input.focus({ preventScroll: true });
      // keep the cursor at the end
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        /* some input types don't allow it */
      }
    });
    wrap.append(btn);
  });
}
