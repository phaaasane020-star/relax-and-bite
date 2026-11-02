// Ghana Card number: GHA-123456789-0 (GHA, 9 digits, 1 check digit).
// The box formats itself as the person types: they only type the digits.

export function ghanaCardDigits(input: string): string {
  return input.replace(/^\s*GHA/i, '').replace(/\D/g, '').slice(0, 10);
}

/** "1234567890" -> "GHA-123456789-0". Partial input stays partial: "123" -> "GHA-123". */
export function formatGhanaCard(input: string): string {
  const d = ghanaCardDigits(input);
  if (!d) return '';
  return `GHA-${d.slice(0, 9)}${d.length > 9 ? `-${d.slice(9)}` : ''}`;
}

export function isGhanaCard(input: string): boolean {
  return ghanaCardDigits(input).length === 10;
}

/** Browser: format every input[data-ghana-card] while typing, with a live hint underneath. */
export function bindGhanaCardInputs(): void {
  document.querySelectorAll<HTMLInputElement>('input[data-ghana-card]').forEach((box) => {
    const hint = document.createElement('p');
    hint.className = 'text-sm font-semibold mt-1.5';
    hint.hidden = true;
    hint.setAttribute('aria-live', 'polite');
    hint.id = `${box.id}-hint`;
    box.insertAdjacentElement('afterend', hint);
    box.setAttribute('aria-describedby', hint.id);

    let lastDigits = ghanaCardDigits(box.value);
    const paint = (final: boolean) => {
      const n = ghanaCardDigits(box.value).length;
      if (n === 0) {
        hint.hidden = true;
        box.removeAttribute('aria-invalid');
      } else if (n === 10) {
        hint.hidden = false;
        hint.className = 'text-sm font-semibold mt-1.5 text-success';
        hint.textContent = 'Ghana Card number looks right';
        box.removeAttribute('aria-invalid');
      } else {
        hint.hidden = false;
        hint.className = `text-sm font-semibold mt-1.5 ${final ? 'text-danger' : 'text-muted'}`;
        hint.textContent = final
          ? `This number is ${10 - n} ${10 - n === 1 ? 'digit' : 'digits'} short. It should look like GHA-123456789-0.`
          : `${10 - n} more ${10 - n === 1 ? 'digit' : 'digits'}`;
        if (final) box.setAttribute('aria-invalid', 'true');
      }
    };

    box.addEventListener('input', (e) => {
      let digits = ghanaCardDigits(box.value);
      // Backspace over a dash: remove the digit before it instead of getting stuck
      if ((e as InputEvent).inputType === 'deleteContentBackward' && digits === lastDigits) digits = digits.slice(0, -1);
      box.value = formatGhanaCard(digits) || 'GHA-';
      lastDigits = digits;
      paint(false);
    });
    box.addEventListener('focus', () => {
      if (!box.value) box.value = 'GHA-';
    });
    box.addEventListener('blur', () => {
      if (!ghanaCardDigits(box.value)) box.value = '';
      paint(true);
    });
    if (box.value) {
      box.value = formatGhanaCard(box.value);
      paint(true);
    }
  });
}
