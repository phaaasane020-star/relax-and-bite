// Shared formatting helpers (safe on server and in the browser).

const TZ = 'Africa/Accra';

/** GH₵ 1,240.00 — uses a non-breaking space so prices never wrap. */
export function money(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `GH₵ ${s}`;
}

/** "21:00" -> "9:00 pm" */
export function time12(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** ISO -> "7:05 pm" */
export function clock(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })
    .replace(/\s?(AM|PM|am|pm)$/, (x) => ` ${x.trim().toLowerCase()}`);
}

/** ISO -> "15 Oct, 7:05 pm" */
export function dateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
  return `${date}, ${clock(iso)}`;
}

/** Ghana mobile prefixes and their networks. */
export const NETWORKS: Record<string, string> = {
  '024': 'MTN', '025': 'MTN', '053': 'MTN', '054': 'MTN', '055': 'MTN', '059': 'MTN',
  '020': 'Telecel', '050': 'Telecel',
  '026': 'AirtelTigo', '027': 'AirtelTigo', '056': 'AirtelTigo', '057': 'AirtelTigo',
};

/** Strips spaces and the country code: "+233 24 123 4567" -> "0241234567" (not yet validated). */
export function cleanPhone(input: string): string {
  let p = input.replace(/[\s\-()]/g, '');
  if (p.startsWith('+233')) p = '0' + p.slice(4);
  else if (p.startsWith('00233')) p = '0' + p.slice(5);
  else if (p.startsWith('233') && p.length === 12) p = '0' + p.slice(3);
  else if (/^[2-5]\d{8}$/.test(p)) p = '0' + p; // typed without the 0 after +233
  return p;
}

/** Ghana mobile number -> "0241234567", or null if it isn't one. */
export function normalizePhone(input: string): string | null {
  const p = cleanPhone(input);
  return /^0\d{9}$/.test(p) && NETWORKS[p.slice(0, 3)] ? p : null;
}

/** "0241234567" -> "MTN" */
export function phoneNetwork(input: string): string | null {
  const p = normalizePhone(input);
  return p ? NETWORKS[p.slice(0, 3)] : null;
}

/** Why a phone number is wrong, in plain words, or null when it's fine. */
export function phoneProblem(input: string): string | null {
  const p = cleanPhone(input);
  if (!p) return 'Enter your phone number.';
  if (/[^\d+]/.test(p)) return 'Use numbers only, for example 024 123 4567.';
  if (!p.startsWith('0')) return 'Enter a Ghana number, for example 024 123 4567.';
  if (p.length < 10) return `That's ${p.length} digits. Ghana numbers have 10, for example 024 123 4567.`;
  if (p.length > 10) return `That's ${p.length} digits. Ghana numbers have 10, for example 024 123 4567.`;
  if (!NETWORKS[p.slice(0, 3)]) return `${p.slice(0, 3)} isn't an MTN, Telecel or AirtelTigo number. Check the first three digits.`;
  return null;
}

/** "0241234567" -> "024 123 4567" */
export function prettyPhone(p: string): string {
  return p.length === 10 ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
