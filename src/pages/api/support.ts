// The customer's support chat: GET shows it, POST takes the next step.
import type { APIRoute } from 'astro';
import { json } from '../../lib/http';
import { getUser } from '../../lib/session';
import { customerAct, getActiveChat, viewChat } from '../../data/support';
import { UserError } from '../../lib/supabase';

export const GET: APIRoute = async ({ cookies }) => {
  const user = getUser(cookies);
  if (!user) return json({ error: 'Sign in to chat with us.' }, 401);
  return json(await viewChat(await getActiveChat(user.id)));
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getUser(cookies);
  if (!user) return json({ error: 'Sign in to chat with us.' }, 401);
  const body = (await request.json().catch(() => ({}))) as { step?: string; value?: string; text?: string };
  try {
    const chat = await customerAct(user.id, { step: String(body.step ?? ''), value: body.value, text: body.text });
    return json(await viewChat(chat));
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    throw e;
  }
};
