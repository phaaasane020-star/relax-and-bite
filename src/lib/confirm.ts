// "Are you sure?" prompt for harmful actions, using the shared
// <dialog id="confirm-dialog"> in BaseLayout.

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Just a message with one button (no Cancel) */
  alertOnly?: boolean;
};

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  const dialog = document.getElementById('confirm-dialog') as HTMLDialogElement | null;
  if (!dialog) return Promise.resolve(window.confirm(opts.title));

  const title = dialog.querySelector<HTMLElement>('[data-confirm-title]')!;
  const message = dialog.querySelector<HTMLElement>('[data-confirm-message]')!;
  const ok = dialog.querySelector<HTMLButtonElement>('[data-confirm-ok]')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-confirm-cancel]')!;

  title.textContent = opts.title;
  message.textContent = opts.message ?? '';
  message.hidden = !opts.message;
  ok.textContent = opts.confirmLabel ?? 'Continue';
  cancel.textContent = opts.cancelLabel ?? 'Cancel';
  ok.className = `btn ${opts.danger ? 'btn-danger' : 'btn-primary'} flex-1`;
  cancel.hidden = Boolean(opts.alertOnly);

  return new Promise((resolve) => {
    const finish = (value: boolean) => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onClose = () => finish(false);
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    (opts.alertOnly ? ok : cancel).focus();
  });
}

/** Ask before submitting any <form data-confirm="Title" data-confirm-message="..."> */
export function bindConfirmForms(): void {
  document.querySelectorAll<HTMLFormElement>('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      if (form.dataset.confirmed === 'yes') return;
      e.preventDefault();
      const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
      const yes = await confirmAction({
        title: form.dataset.confirm!,
        message: form.dataset.confirmMessage,
        confirmLabel: form.dataset.confirmLabel,
        danger: form.dataset.confirmDanger === 'true',
      });
      if (!yes) return;
      form.dataset.confirmed = 'yes';
      if (submitter) form.requestSubmit(submitter);
      else form.requestSubmit();
    });
  });
}
