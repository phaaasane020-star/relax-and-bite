// Protects the vendor, rider and admin panels.
import { defineMiddleware } from 'astro:middleware';
import type { MiddlewareHandler } from 'astro';
import { getSessionAccount, homeFor } from './data/partners';
import { getPartnerToken } from './lib/session';

const AREAS = { '/vendor': 'vendor', '/rider': 'rider', '/admin': 'admin' } as const;
type Area = keyof typeof AREAS;

/** While developing: print how long each page took to build, in the terminal. */
async function timed(path: string, method: string, run: () => Promise<Response>): Promise<Response> {
  if (!import.meta.env.DEV) return run();
  const started = Date.now();
  const res = await run();
  const type = res.headers.get('content-type') ?? '';
  if (!res.body || !type.includes('text/html')) return res;
  // The page streams out in parts; time it to the last part
  const body = res.body.pipeThrough(
    new TransformStream({
      flush() {
        const ms = Date.now() - started;
        console.log(`[page] ${method} ${path}  ready in ${ms} ms${ms > 2000 ? '  << slow' : ''}`);
      },
    }),
  );
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

const guard = (async (ctx, next) => {
  const path = ctx.url.pathname;
  const area = (Object.keys(AREAS) as Area[]).find((p) => path === p || path.startsWith(`${p}/`));
  if (!area) return next();

  const account = await getSessionAccount(getPartnerToken(ctx.cookies));
  if (!account) return ctx.redirect(`/partner/login?next=${encodeURIComponent(path)}`);
  if (account.status !== 'approved') return ctx.redirect('/partner/pending');
  if (account.role !== AREAS[area]) return ctx.redirect(homeFor(account));

  ctx.locals.partner = account;
  return next();
}) satisfies MiddlewareHandler;

export const onRequest = defineMiddleware((ctx, next) => timed(ctx.url.pathname, ctx.request.method, () => guard(ctx, next)));
