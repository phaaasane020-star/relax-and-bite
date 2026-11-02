// Dropdowns in our own colours and font. A phone draws a normal <select> with
// its own grey pop-up and system font; here each one gets a button that looks
// like our fields and opens a sheet listing the choices. The real <select>
// stays in the form (hidden), so saving, required checks and any code that
// listens for "change" work exactly as before.
// Add data-native to a <select> to keep the phone's own pop-up.

const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
const CHEVRON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

let sheet: HTMLDialogElement | null = null;

function getSheet(): HTMLDialogElement {
  if (sheet) return sheet;
  sheet = document.createElement('dialog');
  sheet.className = 'sheet cs-sheet';
  sheet.setAttribute('aria-labelledby', 'cs-title');
  sheet.innerHTML = `<div class="p-5 sm:p-6 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <h2 id="cs-title" class="text-lg font-extrabold tracking-tight pl-1"></h2>
      <button type="button" data-cs-close class="icon-btn icon-btn-round border-0 shrink-0 -mr-2 text-muted" aria-label="Close">${CLOSE}</button>
    </div>
    <div role="listbox" class="cs-list flex flex-col gap-1 max-h-[60dvh] overflow-y-auto -mx-1 px-1"></div>
  </div>`;
  document.body.append(sheet);
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || (e.target as Element).closest('[data-cs-close]')) sheet!.close();
  });
  return sheet;
}

function labelFor(select: HTMLSelectElement): string {
  const label = select.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(select.id)}"]`) : null;
  return (label?.textContent || select.getAttribute('aria-label') || 'Choose').replace(/\s*\(optional\)\s*/i, '').trim();
}

function open(select: HTMLSelectElement, trigger: HTMLButtonElement): void {
  const dialog = getSheet();
  dialog.querySelector('#cs-title')!.textContent = labelFor(select);
  const list = dialog.querySelector<HTMLElement>('.cs-list')!;
  list.replaceChildren();
  for (const opt of Array.from(select.options)) {
    if (opt.disabled && opt.value === '') continue; // the "Choose…" line
    const row = document.createElement('button');
    row.type = 'button';
    row.setAttribute('role', 'option');
    const chosen = opt.selected && opt.value !== '';
    row.setAttribute('aria-selected', String(chosen));
    row.disabled = opt.disabled;
    row.className = 'cs-option';
    row.innerHTML = `<span class="flex-1 min-w-0 truncate"></span><span class="cs-check">${CHECK}</span>`;
    row.querySelector('span')!.textContent = opt.textContent ?? '';
    row.addEventListener('click', () => {
      select.value = opt.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      dialog.close();
      trigger.focus();
    });
    list.append(row);
  }
  dialog.showModal();
  (list.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.querySelector<HTMLElement>('.cs-option'))?.focus();
}

function enhance(select: HTMLSelectElement): void {
  if (select.dataset.csDone || select.multiple || select.hasAttribute('data-native')) return;
  select.dataset.csDone = '1';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `${select.className} cs-trigger`;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.innerHTML = `<span class="cs-value flex-1 min-w-0 truncate text-left"></span><span class="cs-chevron">${CHEVRON}</span>`;
  const value = trigger.querySelector<HTMLElement>('.cs-value')!;
  const sync = () => {
    const opt = select.selectedOptions[0];
    const empty = !opt || opt.value === '';
    value.textContent = opt?.textContent?.trim() || 'Choose';
    value.classList.toggle('text-faint', empty);
    trigger.disabled = select.disabled;
    trigger.toggleAttribute('aria-invalid', select.getAttribute('aria-invalid') === 'true');
  };
  sync();
  select.addEventListener('change', sync);
  select.form?.addEventListener('reset', () => window.setTimeout(sync, 0));
  // A label pointing at the select opens the sheet instead
  if (select.id) {
    document.querySelectorAll<HTMLLabelElement>(`label[for="${CSS.escape(select.id)}"]`).forEach((l) =>
      l.addEventListener('click', (e) => {
        e.preventDefault();
        trigger.focus();
      }),
    );
  }
  trigger.addEventListener('click', () => open(select, trigger));
  select.classList.add('cs-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(trigger);
  // If the form's own check finds this empty, send them to the button
  select.addEventListener('invalid', () => trigger.focus());
}

export function bindCustomSelects(root: ParentNode = document): void {
  root.querySelectorAll<HTMLSelectElement>('select.field-input').forEach(enhance);
}
