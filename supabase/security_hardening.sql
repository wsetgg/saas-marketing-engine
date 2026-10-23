-- Security hardening: persistent AI usage limits.
-- Apply this migration in the Supabase SQL Editor before deploying the app changes.

create table if not exists public.ai_usage_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('generation', 'research')),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, action)
);

alter table public.ai_usage_limits enable row level security;
revoke all on table public.ai_usage_limits from anon, authenticated;
revoke all on table public.ai_usage_limits from public;

create or replace function public.consume_ai_usage_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, request_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_user_id is null
     or p_action is null
     or p_action not in ('generation', 'research')
     or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit arguments';
  end if;

  insert into public.ai_usage_limits as limits
    (user_id, action, window_started_at, request_count, updated_at)
  values
    (p_user_id, p_action, now(), 1, now())
  on conflict (user_id, action) do update
    set window_started_at = case
          when limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then now()
          else limits.window_started_at
        end,
        request_count = case
          when limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then 1
          else limits.request_count + 1
        end,
        updated_at = now()
    where limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
       or limits.request_count < p_limit
  returning request_count into v_count;

  if found then
    return query select true, v_count;
  else
    return query select false, p_limit;
  end if;
end;
$$;

revoke all on function public.consume_ai_usage_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_usage_limit(uuid, text, integer, integer) to service_role;
