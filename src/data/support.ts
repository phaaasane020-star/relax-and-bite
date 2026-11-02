// Support chat for customers. A simple assistant (no AI, just fixed steps) asks
// what it's about and which order, then takes their message; from there the
// Relax&Bite team replies in the same chat from the admin panel.
//
// Steps (worked out from the chat itself, so a reload carries on where it was):
// 1. no topic yet        -> choose a topic
// 2. order topic, not asked which order -> choose an order (or "not about an order")
// 3. status 'bot'        -> type what happened -> status 'open', the team is told
// 4. status 'open'       -> chat freely with the team
// 5. status 'closed'     -> start a new chat

import { sql, sqlOne, UserError } from '../lib/supabase';
import { isUuid } from '../lib/ids';
import { dateTime } from '../lib/format';
import { SITE } from './site';
import { pushCustomerQuietly, pushQuietly } from './push';

export const TOPICS = ['Order issue', 'Payment or refund', 'Delivery problem', 'Account help', 'Something else'] as const;
const ORDER_TOPICS: string[] = ['Order issue', 'Payment or refund', 'Delivery problem'];

export type SupportChat = {
  id: string;
  customer_id: string;
  topic: string | null;
  order_code: string | null;
  order_asked: boolean;
  status: 'bot' | 'open' | 'closed';
  waiting_staff: boolean;
  closed_by: string;
  created_at: string;
  updated_at: string;
};
export type SupportMessage = { id: number; sender: 'customer' | 'staff' | 'bot'; author: string; body: string; created_at: string };
export type Prompt =
  | { kind: 'options'; step: 'topic' | 'order'; options: { value: string; label: string; detail?: string }[] }
  | { kind: 'text'; placeholder: string }
  | { kind: 'closed' };
export type ChatView = { chat: SupportChat; messages: SupportMessage[]; prompt: Prompt; status: string };

const ASSISTANT = `${SITE.name} Assistant`;
const CHAT_COLS = 'id, customer_id, topic, order_code, order_asked, status, waiting_staff, closed_by, created_at, updated_at';

async function say(chatId: string, sender: SupportMessage['sender'], body: string, author = ''): Promise<void> {
  await sql('insert into support_messages (chat_id, sender, author, body) values ($1::uuid, $2, $3, $4) returning id', [
    chatId,
    sender,
    author.slice(0, 80),
    body.trim().slice(0, 1000),
  ]);
}

async function touch(chatId: string, set: string, params: unknown[] = []): Promise<void> {
  await sql(`update support_chats set ${set}, updated_at = now() where id = $1::uuid returning id`, [chatId, ...params]);
}

async function customerName(customerId: string): Promise<string> {
  const c = await sqlOne<{ name: string }>('select name from customer_users where id = $1::uuid', [customerId]);
  return (c?.name ?? '').split(' ')[0] ?? '';
}

/** The customer's current chat (or a new one, which starts with the assistant's greeting). */
export async function getActiveChat(customerId: string, startNew = false): Promise<SupportChat> {
  if (!startNew) {
    const current = await sqlOne<SupportChat>(
      `select ${CHAT_COLS} from support_chats where customer_id = $1::uuid order by created_at desc limit 1`,
      [customerId],
    );
    if (current) return current;
  }
  const chat = (await sqlOne<SupportChat>(`insert into support_chats (customer_id) values ($1::uuid) returning ${CHAT_COLS}`, [customerId]))!;
  const name = await customerName(customerId);
  await say(chat.id, 'bot', `Hi${name ? ` ${name}` : ''}, I'm the ${SITE.name} assistant. I'll get the right details, then someone from our team will reply here. What do you need help with?`, ASSISTANT);
  return chat;
}

async function recentOrders(customerId: string): Promise<{ code: string; vendor_name: string; created_at: string }[]> {
  return sql('select code, vendor_name, created_at from orders where customer_id = $1::uuid order by created_at desc limit 5', [customerId]);
}

function statusLine(chat: SupportChat): string {
  if (chat.status === 'bot') return 'The assistant is collecting details';
  if (chat.status === 'closed') return 'This chat is closed';
  return chat.waiting_staff ? 'Our team will reply here' : 'Chatting with the Relax&Bite team';
}

export async function viewChat(chat: SupportChat): Promise<ChatView> {
  const messages = await sql<SupportMessage>(
    'select id, sender, author, body, created_at from support_messages where chat_id = $1::uuid order by id limit 300',
    [chat.id],
  );
  let prompt: Prompt;
  if (chat.status === 'closed') prompt = { kind: 'closed' };
  else if (!chat.topic) prompt = { kind: 'options', step: 'topic', options: TOPICS.map((t) => ({ value: t, label: t })) };
  else if (ORDER_TOPICS.includes(chat.topic) && !chat.order_asked) {
    const orders = await recentOrders(chat.customer_id);
    prompt = {
      kind: 'options',
      step: 'order',
      options: [
        ...orders.map((o) => ({ value: o.code, label: `${o.code} · ${o.vendor_name}`, detail: dateTime(o.created_at) })),
        { value: 'none', label: orders.length ? "It's not about one of these" : "It's not about an order" },
      ],
    };
  } else prompt = { kind: 'text', placeholder: chat.status === 'bot' ? 'Tell us what happened' : 'Write a message' };
  return { chat, messages, prompt, status: statusLine(chat) };
}

/** What the assistant says before asking them to describe it, for each topic. */
function askDetails(topic: string): string {
  switch (topic) {
    case 'Payment or refund':
      return 'Refunds for cancelled orders paid online go back to the same MoMo wallet or card, usually within 1 to 3 working days. Tell us what happened, and include the amount if you can.';
    case 'Delivery problem':
      return 'Tell us what happened. If the rider is nearby, you can also call them from the order page.';
    case 'Order issue':
      return 'Tell us what went wrong with the order, for example a missing item. You can mention a photo and we will ask for it.';
    case 'Account help':
      return 'Tell us what you need help with, for example signing in or changing your details.';
    default:
      return 'Tell us how we can help.';
  }
}

async function alertTeam(chat: SupportChat, preview: string, first: boolean): Promise<void> {
  try {
    const staff = await sql<{ id: string }>(`select id from partner_accounts where role = 'admin' and status = 'approved' limit 30`);
    await pushQuietly(
      staff.map((s) => s.id),
      { title: first ? `New support chat: ${chat.topic ?? 'Help'}` : 'New message in support', body: preview.slice(0, 120), url: `/admin/support/${chat.id}`, tag: `support-${chat.id}` },
    );
  } catch (e) {
    console.error('[support] alert skipped:', (e as Error).message);
  }
}

/** One step from the customer: a topic, an order, or a message. */
export async function customerAct(customerId: string, action: { step: string; value?: string; text?: string }): Promise<SupportChat> {
  let chat = await getActiveChat(customerId, action.step === 'new');
  if (action.step === 'new') return chat;
  if (chat.status === 'closed') throw new UserError('This chat is closed. Start a new one.');

  if (action.step === 'topic') {
    const topic = TOPICS.find((t) => t === action.value);
    if (!topic || chat.topic) throw new UserError('Choose one of the options.');
    await say(chat.id, 'customer', topic);
    await touch(chat.id, 'topic = $2', [topic]);
    await say(chat.id, 'bot', ORDER_TOPICS.includes(topic) ? 'Which order is it about?' : askDetails(topic), ASSISTANT);
  } else if (action.step === 'order') {
    if (!chat.topic || chat.order_asked) throw new UserError('Choose one of the options.');
    let code: string | null = null;
    if (action.value !== 'none') {
      const o = await sqlOne<{ code: string; vendor_name: string }>('select code, vendor_name from orders where customer_id = $1::uuid and code = $2', [customerId, String(action.value ?? '')]);
      if (!o) throw new UserError('Choose one of your orders.');
      code = o.code;
      await say(chat.id, 'customer', `${o.code} · ${o.vendor_name}`);
    } else await say(chat.id, 'customer', 'Not about an order');
    await touch(chat.id, 'order_asked = true, order_code = $2', [code]);
    await say(chat.id, 'bot', askDetails(chat.topic), ASSISTANT);
  } else if (action.step === 'message') {
    const text = String(action.text ?? '').trim();
    if (text.length < 2) throw new UserError('Write a message.');
    if (chat.status === 'bot' && (!chat.topic || (ORDER_TOPICS.includes(chat.topic) && !chat.order_asked))) throw new UserError('Choose one of the options first.');
    await say(chat.id, 'customer', text);
    const first = chat.status === 'bot';
    await touch(chat.id, `status = 'open', waiting_staff = true`);
    if (first) {
      const name = await customerName(customerId);
      await say(chat.id, 'bot', `Thanks${name ? `, ${name}` : ''}. Our team has your message and will reply here. You'll get a notification when they do.`, ASSISTANT);
    }
    chat = (await sqlOne<SupportChat>(`select ${CHAT_COLS} from support_chats where id = $1::uuid`, [chat.id]))!;
    await alertTeam(chat, text, first);
    return chat;
  } else throw new UserError('Unknown step.');

  return (await sqlOne<SupportChat>(`select ${CHAT_COLS} from support_chats where id = $1::uuid`, [chat.id]))!;
}

// ---------- The team (admin panel) ----------
export type StaffChatRow = SupportChat & { customer_name: string; customer_email: string; customer_phone: string | null; last_body: string; last_at: string };

export async function listSupportChats(): Promise<StaffChatRow[]> {
  return sql<StaffChatRow>(
    `select c.id, c.customer_id, c.topic, c.order_code, c.order_asked, c.status, c.waiting_staff, c.closed_by, c.created_at, c.updated_at,
       u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
       coalesce((select m.body from support_messages m where m.chat_id = c.id and m.sender <> 'bot' order by m.id desc limit 1), '') as last_body,
       coalesce((select max(m.created_at) from support_messages m where m.chat_id = c.id), c.created_at) as last_at
     from support_chats c join customer_users u on u.id = c.customer_id
     where c.status <> 'bot'
     order by (c.status = 'closed'), c.waiting_staff desc, c.updated_at desc limit 200`,
  );
}

export async function countWaitingChats(): Promise<number> {
  return (await sqlOne<{ n: number }>(`select count(*)::int as n from support_chats where status = 'open' and waiting_staff`))?.n ?? 0;
}

export async function getChatForStaff(id: string): Promise<{ chat: StaffChatRow; messages: SupportMessage[] } | null> {
  if (!isUuid(id)) return null;
  const chat = (await listSupportChatsById(id))[0];
  if (!chat) return null;
  const messages = await sql<SupportMessage>('select id, sender, author, body, created_at from support_messages where chat_id = $1::uuid order by id limit 500', [id]);
  return { chat, messages };
}

async function listSupportChatsById(id: string): Promise<StaffChatRow[]> {
  return sql<StaffChatRow>(
    `select c.id, c.customer_id, c.topic, c.order_code, c.order_asked, c.status, c.waiting_staff, c.closed_by, c.created_at, c.updated_at,
       u.name as customer_name, u.email as customer_email, u.phone as customer_phone, '' as last_body, c.updated_at as last_at
     from support_chats c join customer_users u on u.id = c.customer_id where c.id = $1::uuid`,
    [id],
  );
}

export async function staffReply(id: string, by: string, body: string): Promise<void> {
  const text = body.trim();
  if (text.length < 1) throw new UserError('Write a reply.');
  const chat = (await listSupportChatsById(id))[0];
  if (!chat) throw new UserError('Chat not found.');
  if (chat.status === 'closed') throw new UserError('This chat is closed.');
  await say(id, 'staff', text, by.split(' ')[0] ?? 'Support');
  await touch(id, `status = 'open', waiting_staff = false`);
  await pushCustomerQuietly(chat.customer_id, 'support', { title: `${SITE.name} support replied`, body: text.slice(0, 120), url: '/help/chat', tag: `support-${id}` });
}

export async function closeSupportChat(id: string, by: string): Promise<void> {
  const chat = (await listSupportChatsById(id))[0];
  if (!chat || chat.status === 'closed') throw new UserError('This chat is already closed.');
  await touch(id, `status = 'closed', waiting_staff = false, closed_by = $2`, [by.slice(0, 80)]);
  await say(id, 'bot', 'This chat has been closed. If you need anything else, start a new chat any time.', ASSISTANT);
}
