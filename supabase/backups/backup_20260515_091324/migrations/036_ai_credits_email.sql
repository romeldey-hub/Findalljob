-- Add email column to ai_credits and backfill from profiles
ALTER TABLE public.ai_credits
  ADD COLUMN IF NOT EXISTS email text;

UPDATE public.ai_credits ac
SET email = p.email
FROM public.profiles p
WHERE ac.user_id = p.user_id
  AND ac.email IS NULL;
