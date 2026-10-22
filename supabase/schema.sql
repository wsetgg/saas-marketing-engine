-- Run this entire file in Supabase SQL Editor.
-- Subscription rows are written only by the server using the service-role key.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
revoke all on table public.subscriptions from anon, authenticated;

create table if not exists public.workspace_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default '',
  workspace_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_data enable row level security;
grant select, insert, update on table public.workspace_data to authenticated;

drop policy if exists "Users can view their own workspace" on public.workspace_data;
create policy "Users can view their own workspace"
  on public.workspace_data for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own workspace" on public.workspace_data;
create policy "Users can create their own workspace"
  on public.workspace_data for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own workspace" on public.workspace_data;
create policy "Users can update their own workspace"
  on public.workspace_data for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Growthdesk AI workspace tables and safe subscription-status reads.
create table if not exists public.growthdesk_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('plan', 'content', 'campaign', 'task')),
  title text not null check (char_length(title) <= 240),
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'Saved' check (char_length(status) <= 40),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growthdesk_items_user_created_idx
  on public.growthdesk_items (user_id, created_at desc);
create index if not exists growthdesk_items_user_type_idx
  on public.growthdesk_items (user_id, item_type);

alter table public.growthdesk_items enable row level security;
grant select, insert, update, delete on public.growthdesk_items to authenticated;

drop policy if exists "Users can view their own Growthdesk items" on public.growthdesk_items;
create policy "Users can view their own Growthdesk items"
  on public.growthdesk_items for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own Growthdesk items" on public.growthdesk_items;
create policy "Users can create their own Growthdesk items"
  on public.growthdesk_items for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Growthdesk items" on public.growthdesk_items;
create policy "Users can update their own Growthdesk items"
  on public.growthdesk_items for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own Growthdesk items" on public.growthdesk_items;
create policy "Users can delete their own Growthdesk items"
  on public.growthdesk_items for delete to authenticated
  using (auth.uid() = user_id);

-- Let a signed-in user check only their own subscription status.
-- Stripe identifiers remain unavailable to authenticated clients.
revoke all on table public.subscriptions from anon, authenticated;
grant select (user_id, status, current_period_end) on public.subscriptions to authenticated;
drop policy if exists "Users can view their own subscription status" on public.subscriptions;
create policy "Users can view their own subscription status"
  on public.subscriptions for select to authenticated
  using (auth.uid() = user_id);
