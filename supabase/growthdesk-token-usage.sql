-- Daily AI token allowance for Growthdesk.
-- Run this file in Supabase SQL Editor after the existing Growthdesk chat schema.
-- Only server-side requests using the Supabase service-role key may call the RPCs.

create table if not exists public.growthdesk_token_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  tokens_used bigint not null default 0 check (tokens_used >= 0),
  tokens_reserved bigint not null default 0 check (tokens_reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.growthdesk_token_usage enable row level security;
revoke all on table public.growthdesk_token_usage from anon, authenticated;
grant all on table public.growthdesk_token_usage to service_role;

create or replace function public.growthdesk_reserve_tokens(
  p_user_id uuid,
  p_day date,
  p_estimated_tokens integer,
  p_daily_limit integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_used bigint;
  v_reserved bigint;
begin
  if p_estimated_tokens is null or p_estimated_tokens < 1 or p_daily_limit is null or p_daily_limit < 1 then
    raise exception 'Invalid token reservation';
  end if;

  insert into public.growthdesk_token_usage (user_id, usage_date)
  values (p_user_id, p_day)
  on conflict (user_id, usage_date) do nothing;

  update public.growthdesk_token_usage
     set tokens_reserved = tokens_reserved + p_estimated_tokens,
         updated_at = now()
   where user_id = p_user_id
     and usage_date = p_day
     and tokens_used + tokens_reserved + p_estimated_tokens <= p_daily_limit
  returning tokens_used, tokens_reserved into v_used, v_reserved;

  if found then
    return jsonb_build_object(
      'allowed', true,
      'usedTokens', v_used,
      'reservedTokens', v_reserved,
      'remainingTokens', greatest(0, p_daily_limit - v_used - v_reserved)
    );
  end if;

  select tokens_used, tokens_reserved
    into v_used, v_reserved
    from public.growthdesk_token_usage
   where user_id = p_user_id and usage_date = p_day;

  return jsonb_build_object(
    'allowed', false,
    'usedTokens', coalesce(v_used, 0),
    'reservedTokens', coalesce(v_reserved, 0),
    'remainingTokens', greatest(0, p_daily_limit - coalesce(v_used, 0) - coalesce(v_reserved, 0))
  );
end;
$$;

create or replace function public.growthdesk_finalize_tokens(
  p_user_id uuid,
  p_day date,
  p_reserved_tokens integer,
  p_actual_tokens integer
) returns void
language sql
security invoker
set search_path = ''
as $$
  update public.growthdesk_token_usage
     set tokens_reserved = greatest(0, tokens_reserved - greatest(1, p_reserved_tokens)),
         tokens_used = tokens_used + greatest(0, p_actual_tokens),
         updated_at = now()
   where user_id = p_user_id and usage_date = p_day;
$$;

revoke all on function public.growthdesk_reserve_tokens(uuid, date, integer, integer) from public, anon, authenticated;
revoke all on function public.growthdesk_finalize_tokens(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function public.growthdesk_reserve_tokens(uuid, date, integer, integer) to service_role;
grant execute on function public.growthdesk_finalize_tokens(uuid, date, integer, integer) to service_role;
