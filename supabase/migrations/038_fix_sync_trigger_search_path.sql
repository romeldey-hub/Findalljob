-- Fix sync_ai_credits_full_name trigger function.
-- Root cause: supabase_auth_admin (GoTrue's DB role) has a search_path that
-- does not include 'public'. The unqualified 'ai_credits' reference in this
-- trigger function therefore fails with "relation does not exist" whenever a
-- new user signs up, bubbling up as "Database error saving new user".
-- Fix: fully-qualify the table name and pin search_path = public.

CREATE OR REPLACE FUNCTION public.sync_ai_credits_full_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_credits
  SET full_name = NEW.full_name
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;
