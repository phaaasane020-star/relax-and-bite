// Driver's licence number. Checked loosely until we lock in the exact DVLA
// layout: letters and digits in groups joined by single dashes, 6 to 20
// characters, at least 5 digits. Admin still checks the card before approval.

export function tidyLicence(input: string, final = false): string {
  let v = input
    .toUpperCase()
    .replace(/[\s_/.]+/g, '-') // spaces and other separators become dashes
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, 24);
  if (final) v = v.replace(/-+$/, '');
  return v;
}

/** Plain-English problem, or null when the number looks right. */
export function licenceProblem(input: string): string | null {
  const v = tidyLicence(input, true);
  const chars = v.replace(/-/g, '');
  const digits = chars.replace(/\D/g, '');
  if (!v) return "Enter your driver's licence number.";
  if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(v)) return 'Use only letters, numbers and single dashes, exactly as printed on your licence.';
  if (chars.length < 6) return 'This number is too short. Copy it exactly as printed on your licence.';
  if (chars.length > 20) return 'This number is too long. Copy it exactly as printed on your licence.';
  if (digits.length < 5) return 'A licence number has at least 5 digits. Check it against your licence.';
  if (/^(\d)\1+$/.test(digits)) return "That doesn't look like a real licence number.";
  return null;
}

/** Browser: tidy input[data-licence] while typing and explain problems when the person leaves the box. */
export function bindLicenceInputs(): void {
  document.querySelectorAll<HTMLInputElement>('input[data-licence]').forEach((box) => {
    const hint = document.createElement('p');
    hint.className = 'text-sm font-semibold mt-1.5';
    hint.hidden = true;
    hint.setAttribute('aria-live', 'polite');
    hint.id = `${box.id}-hint`;
    box.insertAdjacentElement('afterend', hint);
    box.setAttribute('aria-describedby', hint.id);

    const paint = (final: boolean) => {
      if (!box.value) {
        hint.hidden = true;
        box.removeAttribute('aria-invalid');
        box.setCustomValidity('');
        return;
      }
      const problem = licenceProblem(box.value);
      box.setCustomValidity(problem ?? '');
      if (!problem) {
        hint.hidden = false;
        hint.className = 'text-sm font-semibold mt-1.5 text-success';
        hint.textContent = 'Licence number looks right';
        box.removeAttribute('aria-invalid');
      } else if (final) {
        hint.hidden = false;
        hint.className = 'text-sm font-semibold mt-1.5 text-danger';
        hint.textContent = problem;
        box.setAttribute('aria-invalid', 'true');
      } else {
        hint.hidden = true;
      }
    };

    box.addEventListener('input', () => {
      const tidy = tidyLicence(box.value);
      if (tidy !== box.value) box.value = tidy;
      paint(false);
    });
    box.addEventListener('blur', () => {
      box.value = tidyLicence(box.value, true);
      paint(true);
    });
    if (box.value) {
      box.value = tidyLicence(box.value, true);
      paint(true);
    }
  });
}
