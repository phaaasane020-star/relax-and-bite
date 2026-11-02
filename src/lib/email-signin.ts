// Customer sign-in on the page: email address, then the 6-digit code from the
// email. Used by the sign-in popup and the welcome screen. Also sets up the
// "Continue with Google" button for the app.

type Data = { error?: string; email?: string; resendIn?: number; testCode?: string; wait?: number; noAccount?: boolean; existing?: boolean; field?: string };
export type AuthMode = 'signin' | 'signup';

async function post(url: string, body: object): Promise<Data> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Data;
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { wait: data.wait ?? 0, noAccount: data.noAccount === true, field: data.field });
  return data;
}

const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v.trim());

export function bindEmailSignIn(opts: {
  emailForm: HTMLFormElement;
  codeForm: HTMLFormElement;
  /** Where to go after signing in (asked at that moment) */
  onSignedIn: () => void;
  /** Holds the Sign in / Sign up switch, heading and name field (defaults to the email form) */
  root?: ParentNode;
}): { reset: () => void; setMode: (m: AuthMode) => void } {
  const { emailForm, codeForm } = opts;
  const root = opts.root ?? emailForm;
  const emailInput = emailForm.querySelector<HTMLInputElement>('input[name="email"]')!;
  const nameInput = emailForm.querySelector<HTMLInputElement>('input[name="name"]');
  const nameField = root.querySelector<HTMLElement>('[data-name-field]');
  const heading = root.querySelector<HTMLElement>('[data-auth-heading]');
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mode-tab]'));
  const submit = emailForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  let mode: AuthMode = 'signin';
  const setMode = (m: AuthMode) => {
    mode = m;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.modeTab === m)));
    if (nameField) nameField.hidden = m !== 'signup';
    if (nameInput) nameInput.required = m === 'signup';
    if (heading) heading.textContent = m === 'signup' ? 'Create your account' : 'Welcome back';
    submit.textContent = m === 'signup' ? 'Create account' : 'Sign in';
    showError(emailForm, '');
  };
  tabs.forEach((t) => t.addEventListener('click', () => {
    setMode(t.dataset.modeTab as AuthMode);
    (mode === 'signup' && nameInput && !nameInput.value ? nameInput : emailInput).focus();
  }));
  const codeInput = codeForm.querySelector<HTMLInputElement>('input[name="code"]')!;
  const resendBtn = codeForm.querySelector<HTMLButtonElement>('[data-resend]')!;
  const resendTimer = codeForm.querySelector<HTMLElement>('[data-resend-timer]')!;
  const testBox = codeForm.querySelector<HTMLElement>('[data-test-code]')!;
  const label = codeForm.querySelector<HTMLElement>('[data-email-label]')!;
  let email = '';
  let timer = 0;

  function showError(form: HTMLFormElement, msg: string, offerSignUp = false) {
    const el = form.querySelector<HTMLElement>('[data-error]')!;
    el.textContent = msg;
    el.hidden = !msg;
    if (offerSignUp) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ml-1 font-bold text-brand underline underline-offset-2';
      b.textContent = 'Sign up instead';
      b.addEventListener('click', () => {
        setMode('signup');
        (nameInput ?? emailInput).focus();
      });
      el.append(' ', b);
    }
    if (form === emailForm) emailInput.toggleAttribute('aria-invalid', Boolean(msg) && !msg.startsWith('Enter your name'));
    nameInput?.toggleAttribute('aria-invalid', msg.startsWith('Enter your name'));
  }
  const busy = (form: HTMLFormElement, on: boolean, text: string) => {
    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    btn.disabled = on;
    btn.textContent = text;
    if (on) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
  };
  const countdown = (seconds: number) => {
    window.clearInterval(timer);
    let left = Math.max(0, Math.round(seconds));
    resendBtn.disabled = true;
    const tick = () => {
      resendTimer.textContent = left > 0 ? `in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
      if (left <= 0) {
        resendBtn.disabled = false;
        window.clearInterval(timer);
      }
      left -= 1;
    };
    tick();
    timer = window.setInterval(tick, 1000);
  };
  const sendCode = async (address: string) => {
    const data = await post('/api/auth/start', { email: address, mode, name: nameInput?.value ?? '' });
    email = data.email ?? address;
    label.textContent = email;
    // Developing without an email service: the code shows here instead
    testBox.hidden = !data.testCode;
    testBox.textContent = data.testCode ? `Test mode, no email was sent. Your code is ${data.testCode}.` : '';
    countdown(data.resendIn ?? 60);
    // Signing up with an email that already has an account: they're simply signed in
    const note = codeForm.querySelector<HTMLElement>('[data-existing-note]');
    if (note) note.hidden = !(mode === 'signup' && data.existing);
  };

  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(emailForm, '');
    if (mode === 'signup' && nameInput && nameInput.value.trim().length < 2) {
      showError(emailForm, 'Enter your name.');
      nameInput.focus();
      return;
    }
    if (!looksLikeEmail(emailInput.value)) {
      showError(emailForm, 'Enter a valid email address, for example ama@gmail.com.');
      emailInput.focus();
      return;
    }
    const idle = submit.textContent ?? 'Continue';
    busy(emailForm, true, 'Sending code…');
    try {
      await sendCode(emailInput.value.trim());
      emailForm.hidden = true;
      codeForm.hidden = false;
      codeInput.focus();
    } catch (err) {
      showError(emailForm, (err as Error).message, (err as { noAccount?: boolean }).noAccount === true);
    } finally {
      busy(emailForm, false, idle);
    }
  });
  emailInput.addEventListener('input', () => showError(emailForm, ''));

  resendBtn.addEventListener('click', async () => {
    showError(codeForm, '');
    resendBtn.disabled = true;
    try {
      await sendCode(email);
      codeForm.reset();
      codeInput.focus();
    } catch (err) {
      showError(codeForm, (err as Error).message);
      const wait = (err as { wait?: number }).wait ?? 0;
      if (wait) countdown(wait);
      else resendBtn.disabled = false;
    }
  });

  // Sends as soon as all 6 digits are in (typed or pasted)
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    if (codeInput.value.length === 6) codeForm.requestSubmit();
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(codeForm, '');
    busy(codeForm, true, 'Checking…');
    try {
      await post('/api/auth/verify', { email, code: codeInput.value, name: mode === 'signup' ? (nameInput?.value ?? '') : '' });
      opts.onSignedIn();
    } catch (err) {
      showError(codeForm, (err as Error).message);
      busy(codeForm, false, 'Verify and continue');
      codeInput.select();
    }
  });

  const reset = (keepMode = false) => {
    if (!keepMode) setMode('signin');
    window.clearInterval(timer);
    email = '';
    testBox.hidden = true;
    codeForm.reset();
    showError(emailForm, '');
    showError(codeForm, '');
    codeForm.hidden = true;
    emailForm.hidden = false;
  };
  codeForm.querySelector('[data-change]')?.addEventListener('click', () => {
    reset(true);
    emailInput.focus();
  });
  setMode('signin');
  return { reset: () => reset(), setMode };
}

/** Why Google sign-in didn't work, from ?google= on the address. */
export function googleProblem(): string {
  const why = new URLSearchParams(window.location.search).get('google');
  if (why === 'failed') return "Google sign-in didn't finish. Please try again, or use your email.";
  if (why === 'cancelled') return 'Google sign-in was cancelled. You can use your email instead.';
  if (why === 'off') return "Google sign-in isn't available right now. Use your email instead.";
  return '';
}

/**
 * "Continue with Google" in the app: Google doesn't allow signing in inside
 * apps, so it opens in the phone's browser, which hands the sign-in back.
 * An older app without that ability simply doesn't show the button.
 */
export function bindGoogleButtons(root: ParentNode, next: () => string): void {
  const inApp = document.documentElement.classList.contains('in-app');
  root.querySelectorAll<HTMLAnchorElement>('a[data-google]').forEach((a) => {
    const href = () => `/api/auth/google?next=${encodeURIComponent(next())}`;
    if (!inApp) {
      a.addEventListener('click', () => (a.href = href()));
      return;
    }
    const open = window.RBNative?.openInBrowser;
    if (!open) {
      a.hidden = true;
      a.nextElementSibling?.matches('[data-or]') && ((a.nextElementSibling as HTMLElement).hidden = true);
      return;
    }
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.RBNative!.openInBrowser!(`${window.location.origin}${href()}&app=1`);
    });
  });
}
