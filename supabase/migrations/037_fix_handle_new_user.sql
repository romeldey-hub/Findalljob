-- Fix handle_new_user() to also create ai_credits row on signup.
-- Previously only inserted into profiles; missing ai_credits row caused
-- downstream triggers and queries to fail with "Database error saving new user".

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.ai_credits (user_id, email, plan_type, total_credits, used_credits, reset_date, last_credit_reset_at)
  VALUES (
    NEW.id,
    NEW.email,
    'free',
    5,
    0,
    (current_date + interval '1 month')::date,
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
