// Mistakes in a form show right under the field, not at the top of the page.
//
// 1. Before sending: empty required fields, a bad email, a short password, two
//    passwords that don't match... are caught on the phone. The message appears
//    under the field and the page glides to it. Nothing is sent.
// 2. After sending: if the server still finds a problem, the page reloads with
//    the message at the top; it's moved under the field it's about, and the
//    page goes straight there.

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Server messages -> the field they're about (first match wins). */
const WHICH: [RegExp, string[]][] = [
  [/emergency contact name/i, ['emergency_name']],
  [/emergency contact|different number from yours/i, ['emergency_phone']],
  [/front of your Ghana Card/i, ['ghana_card_photo_url']],
  [/photo of your face|passport/i, ['photo_url']],
  [/Ghana Card/i, ['ghana_card']],
  [/number plate/i, ['plate_number']],
  [/licen[cs]e/i, ['licence_number']],
  [/two (new )?passwords/i, ['password_confirm', 'confirm_password']],
  [/current password/i, ['current_password']],
  [/password/i, ['password', 'new_password']],
  [/email/i, ['email']],
  [/business name/i, ['business_name']],
  [/business type/i, ['business_type']],
  [/opening and closing|opening time|closing time|hours/i, ['opens_at']],
  [/food type/i, ['cuisine']],
  [/vehicle/i, ['vehicle']],
  [/Terms and Conditions/i, ['agree_terms']],
  [/details are correct/i, ['agree']],
  [/area you will ride|your town|choose (your |a )?town/i, ['zone_id']],
  [/locality/i, ['locality_id']],
  [/landmark/i, ['landmark']],
  [/promo/i, ['promo_code']],
  [/phone number|Ghana phone/i, ['phone']],
  [/full name|your name|enter the .*name/i, ['full_name', 'name']],
];

const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getClientRects().length > 0;

/** What to put the message under: the field, its custom dropdown, its group or its photo box. */
function anchorFor(field: Field): HTMLElement {
  // Our own dropdowns: the visible button sits right after the hidden <select>
  if (field instanceof HTMLSelectElement && field.nextElementSibling?.classList.contains('cs-trigger')) return field.nextElementSibling as HTMLElement;
  const group = field.closest<HTMLElement>('[data-field-group], fieldset, [data-phone-wrap]');
  if (field.type === 'hidden' || !visible(field)) {
    if (field instanceof HTMLSelectElement && visible(field.nextElementSibling)) return field.nextElementSibling as HTMLElement;
    const box = document.querySelector<HTMLElement>(`[data-photo-preview="${CSS.escape(field.name)}"]`)?.closest<HTMLElement>('label, div');
    if (box) return box;
    if (group && visible(group)) return group;
    const label = field.closest('label');
    if (label && visible(label)) return label;
  }
  if (field.type === 'checkbox' || field.type === 'radio') return field.closest<HTMLElement>('[data-field-group]') ?? field.closest<HTMLElement>('label, fieldset') ?? field;
  if (group && group.matches('[data-phone-wrap]')) return group;
  // Password boxes with the eye button: the message goes under the whole box
  if (field.parentElement?.hasAttribute('data-eye-wrap')) return field.parentElement;
  return field;
}

function clear(field: Field): void {
  const a = anchorFor(field);
  const next = a.nextElementSibling;
  if (next?.matches('[data-inline-error]')) next.remove();
  field.removeAttribute('aria-invalid');
  a.removeAttribute('aria-invalid');
}

export function showFieldError(field: Field, message: string): HTMLElement {
  clear(field);
  const a = anchorFor(field);
  const p = document.createElement('p');
  p.setAttribute('data-inline-error', '');
  p.setAttribute('role', 'alert');
  p.className = 'field-error';
  p.textContent = message;
  a.after(p);
  field.setAttribute('aria-invalid', 'true');
  if (a !== field) a.setAttribute('aria-invalid', 'true');
  const stop = () => clear(field);
  field.addEventListener('input', stop, { once: true });
  field.addEventListener('change', stop, { once: true });
  return a;
}

/** Glide to the field (not to the top), a little above it so its label shows. */
function goTo(anchor: HTMLElement, field: Field): void {
  const r = anchor.getBoundingClientRect();
  const fixedTop = document.querySelector<HTMLElement>('.sticky, header.sticky')?.offsetHeight ?? 0;
  const y = window.scrollY + r.top - Math.max(96, fixedTop + 24);
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
  if (visible(field)) field.focus({ preventScroll: true });
  else (anchor.querySelector<HTMLElement>('button, input, [tabindex]') ?? anchor).focus?.({ preventScroll: true });
}

function labelText(field: Field): string {
  const label = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`) : field.closest('label');
  return (label?.textContent ?? field.getAttribute('aria-label') ?? '').replace(/\(optional\)/i, '').replace(/\s+/g, ' ').trim();
}

function problem(field: Field, form: HTMLFormElement): string {
  const v = field.validity;
  const label = labelText(field);
  const name = label ? label.charAt(0).toLowerCase() + label.slice(1) : 'this';
  if (field.dataset.match) {
    const other = form.querySelector<HTMLInputElement>(`[name="${CSS.escape(field.dataset.match)}"]`);
    if (other && field.value && field.value !== other.value) return 'The two passwords do not match.';
  }
  if (field.dataset.requiredMessage && v.valueMissing) return field.dataset.requiredMessage;
  const min = (field as HTMLInputElement).minLength;
  if (min > 0 && field.value && field.value.length < min) return `Use at least ${min} characters.`;
  if (v.valid) return '';
  if (v.valueMissing) {
    if (field.type === 'checkbox') return 'Tick this box to continue.';
    if (field instanceof HTMLSelectElement || field.type === 'radio') return 'Choose an option.';
    if (field.type === 'hidden') return `Add ${name}.`;
    return `Enter ${name}.`;
  }
  if (v.typeMismatch && field.type === 'email') return 'Enter a valid email address, for example ama@gmail.com.';
  if (v.tooShort) return `Use at least ${(field as HTMLInputElement).minLength} characters.`;
  if (v.patternMismatch) return field.title || `Check ${name}.`;
  return field.validationMessage || `Check ${name}.`;
}

function bindForm(form: HTMLFormElement): void {
  if (form.dataset.inlineDone || form.hasAttribute('data-own-validation')) return;
  form.dataset.inlineDone = '1';
  form.noValidate = true; // our messages, not the browser's bubbles
  form.addEventListener(
    'submit',
    (e) => {
      // A button with formnovalidate (e.g. "Cancel") skips the checks
      const by = (e as SubmitEvent).submitter as HTMLButtonElement | null;
      if (by?.formNoValidate) return;
      let first: { a: HTMLElement; f: Field } | null = null;
      const seenRadio = new Set<string>();
      for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
        if (el.disabled || el.closest('[hidden]') && el.type !== 'hidden') continue;
        if (el.type === 'radio') {
          if (seenRadio.has(el.name)) continue;
          seenRadio.add(el.name);
        }
        const msg = problem(el, form);
        if (!msg) {
          clear(el);
          continue;
        }
        const a = showFieldError(el, msg);
        first ??= { a, f: el };
      }
      if (first) {
        e.preventDefault();
        e.stopImmediatePropagation();
        goTo(first.a, first.f);
      }
    },
    true,
  );
}

/** The server found a problem: move its message under the field and go there. */
function placeServerError(): void {
  const box = document.querySelector<HTMLElement>('[data-form-error]');
  if (!box) return;
  const text = (box.textContent ?? '').trim();
  for (const [re, names] of WHICH) {
    if (!re.test(text)) continue;
    for (const n of names) {
      const field = document.querySelector<Field>(`form [name="${CSS.escape(n)}"]`);
      if (!field) continue;
      const a = showFieldError(field, text);
      box.hidden = true;
      // after the page's own entrance animation has placed things
      window.setTimeout(() => goTo(a, field), 350);
      return;
    }
  }
}

export function bindInlineErrors(): void {
  document.querySelectorAll<HTMLFormElement>('form[method="post" i]').forEach(bindForm);
  placeServerError();
}
