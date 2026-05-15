-- Adds time-based Pro access fields.
-- pro_until:            when Pro access expires (null = legacy/free)
-- cancel_at_period_end: user requested cancellation; access continues until pro_until

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pro_until              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false;
