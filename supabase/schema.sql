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
