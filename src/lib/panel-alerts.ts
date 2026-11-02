// Browser-only alerts for the partner panels: a sound, a vibration and a
// message on screen when an order changes. The panel reloads every few
// seconds, so we remember the last state in sessionStorage and compare.
// Supabase Realtime + push notifications replace the polling later.

/** status and rider are compared; info is extra wording for the message */
export type OrderSnap = { status: string; rider: string; info?: string };
export type Snapshot = Record<string, OrderSnap>;
export type PanelAlert = { text: string; tone: 'new' | 'info' | 'done' | 'warn' };

const SOUND_KEY = 'rb_sound';

function readSnap(key: string): Snapshot | null {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as Snapshot) : null;
  } catch {
    return null;
  }
}

function writeSnap(key: string, snap: Snapshot): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(snap));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Compare this page load with the last one and turn the differences into alerts.
 * `describe` decides what each change means for this kind of partner.
 * Returns nothing on the first load, so opening the panel doesn't alert.
 */
export function collectAlerts(
  key: string,
  now: Snapshot,
  describe: (code: string, before: OrderSnap | undefined, after: OrderSnap, previous: Snapshot) => PanelAlert | null,
): PanelAlert[] {
  const before = readSnap(key);
  writeSnap(key, now);
  if (!before) return [];
  const alerts: PanelAlert[] = [];
  for (const [code, after] of Object.entries(now)) {
    const prev = before[code];
    if (prev && prev.status === after.status && prev.rider === after.rider) continue;
    const a = describe(code, prev, after, before);
    if (a) alerts.push(a);
  }
  return alerts;
}

// ---------- Sound ----------
export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSound(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

/** True when the browser is blocking sound until the person taps the page. */
export function soundBlocked(): boolean {
  const a = audio();
  return !!a && a.state === 'suspended';
}

/** Unlock sound on the next tap or key press (browsers require one). */
export function unlockSoundOnTap(onUnlocked?: () => void): void {
  const a = audio();
  if (!a || a.state !== 'suspended') return;
  const go = () => {
    a.resume().then(() => onUnlocked?.()).catch(() => undefined);
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}

/** Short two-note chime. `urgent` repeats it, for new orders. */
export function chime(urgent = false): void {
  if (!soundOn()) return;
  const a = audio();
  if (!a) return;
  const notes = urgent ? [880, 1175, 880, 1175, 880, 1175] : [784, 1047];
  notes.forEach((freq, i) => {
    const t = a.currentTime + i * 0.18;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(urgent ? 0.35 : 0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  });
  try {
    navigator.vibrate?.(urgent ? [200, 100, 200, 100, 200] : 120);
  } catch {
    /* not supported */
  }
}

// ---------- Messages on screen ----------
const ICONS: Record<PanelAlert['tone'], string> = {
  new: '<path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  info: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17h6l3-7h3"/><path d="M14 10h-3"/>',
  done: '<path d="m5 12 5 5 9-10"/>',
  warn: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
};
const TONES: Record<PanelAlert['tone'], string> = {
  new: 'bg-brand text-on-brand',
  info: 'bg-raised text-brand-ink',
  done: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning-ink',
};

function stack(): HTMLElement {
  let el = document.getElementById('panel-alerts');
  if (!el) {
    el = document.createElement('div');
    el.id = 'panel-alerts';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.className = 'fixed z-[70] top-16 lg:top-6 inset-x-4 sm:left-auto sm:w-[24rem] flex flex-col gap-2';
    document.body.append(el);
  }
  return el;
}

export function showAlert(alert: PanelAlert, ms = 9000): void {
  const card = document.createElement('div');
  card.className = 'card alert-in shadow-lg p-3.5 flex items-start gap-3 text-sm';
  card.innerHTML = `<span class="size-9 rounded-full flex items-center justify-center shrink-0 ${TONES[alert.tone]}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[alert.tone]}</svg></span><p class="flex-1 font-semibold pt-1.5"></p><button type="button" class="text-muted px-1 pt-1" aria-label="Dismiss"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
  card.querySelector('p')!.textContent = alert.text;
  // Fade out slowly, then take it away
  const remove = () => {
    if (card.classList.contains('alert-out')) return;
    card.classList.add('alert-out');
    window.setTimeout(() => card.remove(), 540);
  };
  card.querySelector('button')!.addEventListener('click', remove);
  stack().prepend(card);
  window.setTimeout(remove, ms);
}

/** Show every alert, and play one sound for the batch (louder if anything is new). */
export function announce(alerts: PanelAlert[]): void {
  if (alerts.length === 0) return;
  alerts.slice(0, 4).forEach((a) => showAlert(a));
  if (alerts.length > 4) showAlert({ tone: 'info', text: `${alerts.length - 4} more updates on the board.` });
  chime(alerts.some((a) => a.tone === 'new'));
}
