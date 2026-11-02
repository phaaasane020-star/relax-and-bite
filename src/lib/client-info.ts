// Where a request came from, for the activity log: IP address and a short device name.

export type ClientInfo = { ip: string; device: string };

export function deviceName(ua: string): string {
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iPhone'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'Mac'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'unknown device';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : 'browser';
  return `${browser} on ${os}`;
}

/** Pass Astro (or an API context): reads the IP from Netlify's header, then the proxy header, then the socket. */
export function clientInfo(ctx: { request: Request; clientAddress?: string }): ClientInfo {
  const h = ctx.request.headers;
  let ip = h.get('x-nf-client-connection-ip') || (h.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (!ip) {
    try {
      ip = ctx.clientAddress ?? '';
    } catch {
      ip = '';
    }
  }
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') ip = 'this computer';
  return { ip: ip || 'unknown', device: deviceName(h.get('user-agent') ?? '') };
}
