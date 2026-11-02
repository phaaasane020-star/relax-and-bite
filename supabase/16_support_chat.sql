-- Support chat for customers (replaces WhatsApp on the Help page).
-- The assistant asks what it's about and which order, then the team replies
-- in the same chat from the admin panel.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

create table if not exists support_chats (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customer_users (id) on delete cascade,
  topic         text,                 -- Order issue, Payment or refund...
  order_code    text references orders (code) on delete set null,
  order_asked   boolean not null default false,  -- the "which order?" step is done
  -- bot: the assistant is still collecting details; open: waiting for/with the team; closed: done
  status        text not null default 'bot' check (status in ('bot', 'open', 'closed')),
  waiting_staff boolean not null default false,  -- last message is from the customer
  closed_by     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists support_chats_customer_idx on support_chats (customer_id, created_at desc);
create index if not exists support_chats_open_idx on support_chats (status, updated_at desc);

create table if not exists support_messages (
  id          bigint generated always as identity primary key,
  chat_id     uuid not null references support_chats (id) on delete cascade,
  sender      text not null check (sender in ('customer', 'staff', 'bot')),
  author      text not null default '',
  body        text not null check (length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists support_messages_chat_idx on support_messages (chat_id, id);

alter table support_chats enable row level security;
alter table support_messages enable row level security;
revoke all on table support_chats from anon, authenticated;
revoke all on table support_messages from anon, authenticated;

notify pgrst, 'reload schema';
