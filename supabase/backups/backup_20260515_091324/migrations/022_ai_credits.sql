-- AI credits table — tracks per-user monthly credit balances
create table if not exists ai_credits (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  plan_type            text        not null default 'free',
  total_credits        numeric(10,2) not null default 0,
  used_credits         numeric(10,2) not null default 0,
  remaining_credits    numeric(10,2) generated always as (total_credits - used_credits) stored,
  reset_date           date        not null default (current_date + interval '1 month')::date,
  last_credit_reset_at timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint ai_credits_user_id_key unique (user_id)
);

alter table ai_credits enable row level security;

create policy "Users can view own credits"
  on ai_credits for select
  using (auth.uid() = user_id);

-- Atomically deduct credits — returns {success, remaining} as JSONB.
-- The WHERE guard ensures credits never go negative.
-- Security: authenticated callers can only deduct from their own account;
-- service-role callers (auth.uid() IS NULL) are unrestricted for backend use.
create or replace function deduct_ai_credits(
  p_user_id uuid,
  p_cost    numeric
) returns jsonb language plpgsql security definer as $$
declare
  v_remaining numeric;
begin
  -- Prevent authenticated users from deducting another user's credits
  if auth.uid() is not null and auth.uid() != p_user_id then
    raise exception 'unauthorized: can only deduct own credits';
  end if;

  update ai_credits
  set
    used_credits = used_credits + p_cost,
    updated_at   = now()
  where user_id = p_user_id
    and (total_credits - used_credits) >= p_cost
  returning remaining_credits into v_remaining;

  if found then
    return jsonb_build_object('success', true, 'remaining', v_remaining);
  end if;

  select remaining_credits into v_remaining
  from ai_credits where user_id = p_user_id;

  return jsonb_build_object('success', false, 'remaining', coalesce(v_remaining, 0));
end;
$$;

-- Upsert credits for a user (used by billing webhooks to reset monthly credits).
-- Security: only callable from service role (no JWT → auth.uid() IS NULL).
-- Authenticated users cannot call this to grant themselves credits.
create or replace function reset_user_credits(
  p_user_id  uuid,
  p_total    numeric,
  p_plan     text
) returns void language plpgsql security definer as $$
begin
  -- Block direct calls from authenticated browser clients
  if auth.uid() is not null then
    raise exception 'forbidden: reset_user_credits requires service role';
  end if;

  insert into ai_credits (user_id, plan_type, total_credits, used_credits, reset_date, last_credit_reset_at)
  values (p_user_id, p_plan, p_total, 0, (current_date + interval '1 month')::date, now())
  on conflict (user_id) do update set
    plan_type            = excluded.plan_type,
    total_credits        = excluded.total_credits,
    used_credits         = 0,
    reset_date           = excluded.reset_date,
    last_credit_reset_at = excluded.last_credit_reset_at,
    updated_at           = now();
end;
$$;
