// Live check for every phone box (input type="tel") on the page.
// Shows the network when the number is right, and a plain message when it isn't.
import { cleanPhone, normalizePhone, phoneNetwork, phoneProblem } from './format';

const ICON_OK =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';

function messageFor(input: HTMLInputElement): HTMLElement {
  const anchor = input.closest<HTMLElement>('[data-phone-wrap]') ?? input;
  let el = anchor.parentElement?.querySelector<HTMLElement>(`[data-phone-msg="${input.id || input.name}"]`) ?? null;
  if (!el) {
    el = document.createElement('p');
    el.dataset.phoneMsg = input.id || input.name;
    el.setAttribute('aria-live', 'polite');
    el.className = 'text-sm font-semibold mt-1.5 flex items-center gap-1.5';
    el.id = `${input.id || input.name}-phone-msg`;
    anchor.insertAdjacentElement('afterend', el);
    const describedBy = input.getAttribute('aria-describedby');
    input.setAttribute('aria-describedby', [describedBy, el.id].filter(Boolean).join(' '));
  }
  return el;
}

function check(input: HTMLInputElement, final: boolean): void {
  const msg = messageFor(input);
  const value = input.value.trim();
  if (!value) {
    msg.textContent = '';
    msg.hidden = true;
    input.removeAttribute('aria-invalid');
    input.setCustomValidity('');
    return;
  }
  const digits = cleanPhone(value).replace(/\D/g, '');
  // data-different-from="other-input-id": this number must not match that one
  const otherId = input.dataset.differentFrom;
  const other = otherId ? (document.getElementById(otherId) as HTMLInputElement | null) : null;
  const same = !!other && !!normalizePhone(value) && normalizePhone(value) === normalizePhone(other.value);
  const problem = phoneProblem(value) ?? (same ? input.dataset.sameMessage || "This can't be the same as your own number." : null);
  // While typing, only complain once there are enough digits to judge
  const judge = final || same || digits.length >= 10 || /[^\d\s+\-()]/.test(value);

  if (!problem) {
    msg.hidden = false;
    msg.className = 'text-sm font-semibold mt-1.5 flex items-center gap-1.5 text-success';
    msg.innerHTML = `${ICON_OK}<span></span>`;
    msg.querySelector('span')!.textContent = `${phoneNetwork(value)} number`;
    input.removeAttribute('aria-invalid');
    input.setCustomValidity('');
  } else if (judge) {
    msg.hidden = false;
    msg.className = 'text-sm font-semibold mt-1.5 flex items-center gap-1.5 text-danger';
    msg.textContent = problem;
    input.setAttribute('aria-invalid', 'true');
    input.setCustomValidity(problem);
  } else {
    msg.textContent = '';
    msg.hidden = true;
    input.removeAttribute('aria-invalid');
    input.setCustomValidity('');
  }
}

export function bindPhoneInputs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[type="tel"]').forEach((input) => {
    if (input.dataset.phoneBound) return;
    input.dataset.phoneBound = 'yes';
    input.addEventListener('input', () => check(input, false));
    input.addEventListener('blur', () => check(input, true));
    // Re-check when the number it must differ from changes
    const otherId = input.dataset.differentFrom;
    document.getElementById(otherId ?? '')?.addEventListener('input', () => {
      if (input.value) check(input, true);
    });
    if (input.value) check(input, true);
  });
}
