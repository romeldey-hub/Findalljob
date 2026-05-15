-- Backfill match_snapshot for all applied jobs that don't have one yet.
-- Two passes:
--   1. Use job_matches data where available (preserves score, skills, reasoning).
--   2. Fall back to jobs-table data only for records whose job_matches were already deleted.
--      These get score=0 and empty skills — the card renders with job info but no AI data.
--
-- This migration is safe to run multiple times (match_snapshot IS NULL guard prevents overwrites).
--
-- NOTE: apply_url, apply_status, and last_verified_at are optional columns that may not
-- exist in all environments (added in a later schema migration).  We use NULL for those
-- fields so the backfill succeeds regardless of DB state.  Cards will show "unverified"
-- for the verification badge on backfilled rows, which is the correct safe default.

-- ── Pass 1: Backfill from job_matches ──────────────────────────────────────────────────────
WITH ranked_matches AS (
  SELECT DISTINCT ON (user_id, job_id)
    user_id,
    job_id,
    id         AS match_id,
    ai_score,
    -- Decode the JSON-encoded ai_reasoning to extract the human-readable fields.
    CASE
      WHEN ai_reasoning ~ '^\{.*\}$' THEN COALESCE((ai_reasoning::jsonb ->> 'r'), ai_reasoning)
      ELSE COALESCE(ai_reasoning, '')
    END AS decoded_reasoning,
    CASE
      WHEN ai_reasoning ~ '^\{.*\}$' THEN COALESCE(ai_reasoning::jsonb -> 'mr', '[]'::jsonb)
      ELSE '[]'::jsonb
    END AS match_reasons,
    CASE
      WHEN ai_reasoning ~ '^\{.*\}$' THEN COALESCE(ai_reasoning::jsonb -> 'ms', '[]'::jsonb)
      ELSE '[]'::jsonb
    END AS matched_skills,
    CASE
      WHEN ai_reasoning ~ '^\{.*\}$' THEN COALESCE(ai_reasoning::jsonb -> 'miss', '[]'::jsonb)
      ELSE '[]'::jsonb
    END AS missing_skills,
    CASE
      WHEN ai_reasoning ~ '^\{.*\}$' THEN COALESCE((ai_reasoning::jsonb ->> 'bridge'), '')
      ELSE ''
    END AS bridge_advice
  FROM job_matches
  ORDER BY user_id, job_id, ai_score DESC, created_at DESC
)
UPDATE applications
SET match_snapshot = jsonb_build_object(
  'id',             rm.match_id::text,
  'ai_score',       rm.ai_score,
  'ai_reasoning',   rm.decoded_reasoning,
  'bridge_advice',  rm.bridge_advice,
  'match_reasons',  rm.match_reasons,
  'matched_skills', rm.matched_skills,
  'missing_skills', rm.missing_skills,
  'job', jsonb_build_object(
    'id',             j.id::text,
    'title',          COALESCE(j.title, ''),
    'company',        COALESCE(j.company, ''),
    'location',       COALESCE(j.location, ''),
    'url',            COALESCE(j.url, ''),
    'apply_url',      NULL,
    'apply_status',   NULL,
    'verified_label', 'unverified',
    'salary',         j.salary,
    'source',         j.source,
    'description',    COALESCE(j.description, ''),
    'created_at',     j.created_at
  )
)
FROM ranked_matches rm
JOIN jobs j ON j.id = rm.job_id
WHERE applications.user_id = rm.user_id
  AND applications.job_id  = rm.job_id
  AND applications.status  = 'applied'
  AND applications.match_snapshot IS NULL;

-- ── Pass 2: Minimal snapshot for applied jobs where job_matches are already gone ───────────
-- These cards had their match data wiped by a prior resume deletion.  We still write a
-- snapshot so the card has stable job info and won't flicker between fallback sources.
UPDATE applications
SET match_snapshot = jsonb_build_object(
  'id',             applications.id::text,
  'ai_score',       0,
  'ai_reasoning',   '',
  'bridge_advice',  '',
  'match_reasons',  '[]'::jsonb,
  'matched_skills', '[]'::jsonb,
  'missing_skills', '[]'::jsonb,
  'job', jsonb_build_object(
    'id',             j.id::text,
    'title',          COALESCE(j.title, ''),
    'company',        COALESCE(j.company, ''),
    'location',       COALESCE(j.location, ''),
    'url',            COALESCE(j.url, ''),
    'apply_url',      NULL,
    'apply_status',   NULL,
    'verified_label', 'unverified',
    'salary',         j.salary,
    'source',         j.source,
    'description',    COALESCE(j.description, ''),
    'created_at',     j.created_at
  )
)
FROM jobs j
WHERE applications.job_id  = j.id
  AND applications.status  = 'applied'
  AND applications.match_snapshot IS NULL;
