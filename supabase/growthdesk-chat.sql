-- Growthdesk AI Advisor persistence. Run in Supabase SQL Editor after the existing schema.sql.
create table if not exists public.growthdesk_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists growthdesk_conversations_user_updated_idx
  on public.growthdesk_conversations (user_id, updated_at desc);

create table if not exists public.growthdesk_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.growthdesk_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 12000),
  created_at timestamptz not null default now()
);
create index if not exists growthdesk_messages_conversation_created_idx
  on public.growthdesk_messages (conversation_id, created_at asc);
create index if not exists growthdesk_messages_user_created_idx
  on public.growthdesk_messages (user_id, created_at desc);

create table if not exists public.growthdesk_chat_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.growthdesk_conversations(id) on delete set null,
  model text not null,
  created_at timestamptz not null default now()
);
create index if not exists growthdesk_chat_usage_user_created_idx
  on public.growthdesk_chat_usage (user_id, created_at desc);

alter table public.growthdesk_conversations enable row level security;
alter table public.growthdesk_messages enable row level security;
alter table public.growthdesk_chat_usage enable row level security;
revoke all on public.growthdesk_conversations, public.growthdesk_messages, public.growthdesk_chat_usage from anon, authenticated;
