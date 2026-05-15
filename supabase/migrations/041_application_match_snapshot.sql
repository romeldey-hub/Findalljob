-- Persist the full matched-job card data at the time the user clicks "Mark as Applied".
-- This makes Applied Jobs cards independent of the current search run — they survive
-- new searches, location changes, and cache clears without going blank.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS match_snapshot jsonb;
