// Server-only: sends emails through Resend (resend.com). The API key comes from
// .env and is never sent to phones or browsers.
//
// .env:
//   RESEND_API_KEY=re_...
//   EMAIL_FROM=Relax&Bite <hello@yourdomain.com>   (a domain verified in Resend)
//
// Without a key nothing is sent: while developing, sign-in codes show on
// screen instead, and order alerts are only written to the dev window.

import { serverEnv } from './env';

const DEFAULT_URL = 'https://api.resend.com/emails';

function config(): { url: string; key: string; from: string } {
  const vars = serverEnv();
  return {
    url: (vars.RESEND_API_URL || DEFAULT_URL).trim(),
    key: vars.RESEND_API_KEY.trim(),
    from: (vars.EMAIL_FROM || 'Relax&Bite <onboarding@resend.dev>').trim(),
  };
}

/** true once a Resend API key is in .env. */
export function emailReady(): boolean {
  return config().key.length > 0;
}

export type Email = { to: string | string[]; subject: string; text: string; html?: string };

/** Sends one email. Throws with a message that's safe to show if it doesn't go. */
export async function sendEmail(mail: Email): Promise<void> {
  const { url, key, from } = config();
  const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  if (!to.length) return;
  if (!key) {
    console.log(`[email] (not sent: no RESEND_API_KEY) to ${to.join(', ')}: ${mail.subject}`);
    throw new Error("Email isn't set up yet: add RESEND_API_KEY to .env.");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: mail.subject, text: mail.text, html: mail.html ?? textToHtml(mail.text) }),
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    console.error('[email] Resend could not be reached:', (e as Error).message);
    throw new Error("We couldn't send the email just now. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[email] Resend refused the email (HTTP ${res.status}):`, body.slice(0, 500));
    if (res.status === 401 || res.status === 403) throw new Error('Email sending is misconfigured. Please contact Relax&Bite support.');
    throw new Error("We couldn't send the email just now. Try again in a moment.");
  }
}

/**
 * For alerts that must never hold up an order: tries to send, gives up after
 * a few seconds, and only logs problems.
 */
export async function sendQuietly(mails: Email[], label: string): Promise<void> {
  const list = mails.filter((m) => (Array.isArray(m.to) ? m.to.length : m.to));
  if (!list.length) return;
  if (!emailReady()) {
    for (const m of list) console.log(`[email] (not sent: no RESEND_API_KEY) ${label} to ${[m.to].flat().join(', ')}: ${m.subject}`);
    return;
  }
  const timeout = new Promise<void>((done) => setTimeout(done, 6000));
  await Promise.race([
    Promise.allSettled(list.map((m) => sendEmail(m))).then((results) => {
      results.forEach((r) => {
        if (r.status === 'rejected') console.error(`[email] ${label} not sent:`, (r.reason as Error).message);
      });
    }),
    timeout,
  ]);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A plain, branded email: the name at the top, the message, a button if there's a link. */
export function brandedHtml(opts: { heading: string; lines: string[]; button?: { label: string; url: string }; footer?: string }): string {
  const body = opts.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#5c4547">${esc(l)}</p>`).join('');
  const button = opts.button
    ? `<p style="margin:20px 0 4px"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#ef4444;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:10px">${esc(opts.button.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f6f5f3;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #ebe8e4">
<tr><td style="padding:22px 26px 6px;font-size:20px;font-weight:800;color:#3f292b">Relax&amp;<span style="color:#ef4444">Bite</span></td></tr>
<tr><td style="padding:8px 26px 24px"><h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#3f292b">${esc(opts.heading)}</h1>${body}${button}</td></tr>
</table>
<p style="max-width:520px;margin:14px auto 0;font-size:12px;color:#9c958e">${esc(opts.footer ?? 'Relax&Bite food delivery')}</p>
</td></tr></table></body></html>`;
}

function textToHtml(text: string): string {
  const [first, ...rest] = text.split('\n').filter((l) => l.trim());
  return brandedHtml({ heading: first ?? '', lines: rest });
}
