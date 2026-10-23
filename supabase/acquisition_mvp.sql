-- Growthdesk acquisition MVP. Run once in Supabase SQL Editor.
-- Tokens are encrypted in the application before storage. Never expose this table to clients.
create table if not exists public.ga4_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_refresh_token text not null,
  property_id text,
  property_name text,
  connected_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ga4_connections enable row level security;
revoke all on table public.ga4_connections from anon, authenticated;
-- Only the server-side service role can read or modify encrypted refresh tokens.

create table if not exists public.growth_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  channel text not null default 'Other' check (char_length(channel) <= 40),
  hypothesis text not null check (char_length(hypothesis) between 1 and 3000),
  metric text not null check (char_length(metric) between 1 and 100),
  baseline_value numeric,
  target_value numeric,
  result_value numeric,
  status text not null default 'Planned' check (status in ('Planned','Running','Completed','Paused')),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists growth_experiments_user_created_idx
  on public.growth_experiments(user_id, created_at desc);
alter table public.growth_experiments enable row level security;
grant select, insert, update, delete on public.growth_experiments to authenticated;
drop policy if exists "Users can read own growth experiments" on public.growth_experiments;
create policy "Users can read own growth experiments" on public.growth_experiments
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create own growth experiments" on public.growth_experiments;
create policy "Users can create own growth experiments" on public.growth_experiments
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own growth experiments" on public.growth_experiments;
create policy "Users can update own growth experiments" on public.growth_experiments
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own growth experiments" on public.growth_experiments;
create policy "Users can delete own growth experiments" on public.growth_experiments
  for delete to authenticated using (auth.uid() = user_id);
