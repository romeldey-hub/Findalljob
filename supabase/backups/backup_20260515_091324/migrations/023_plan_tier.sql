-- Add plan tier columns to profiles
alter table profiles
  add column if not exists plan_tier         text not null default 'free',
  add column if not exists pending_plan_tier text;

-- Grandfather existing paid users as pro_plus (the higher tier)
update profiles
set plan_tier = 'pro_plus'
where subscription_status = 'pro' and plan_tier = 'free';
