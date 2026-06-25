-- ============================================================
-- Wave 4 — Google Calendar token encryption (Phase 1 of 2)
--
-- Phased plan:
--   Phase 1 (this file):  Add nullable encrypted columns; drop NOT NULL
--                         from the plaintext columns so new code can write
--                         encrypted-only rows without violating constraints.
--   Migration script:     bin/encrypt-gcal-tokens.mjs back-fills all existing
--                         plaintext rows into the encrypted columns. Run AFTER
--                         deploying the updated google-calendar.js (Artifact B).
--   Phase 2 (next file):  20260626_gcal_drop_plaintext.sql — drop the plaintext
--                         columns and set encrypted columns NOT NULL. Run ONLY
--                         after the migration script reports 0 un-migrated rows.
-- ============================================================

ALTER TABLE google_calendar_tokens
  ADD COLUMN IF NOT EXISTS encrypted_access_token TEXT,
  ADD COLUMN IF NOT EXISTS access_token_iv         TEXT,
  ADD COLUMN IF NOT EXISTS access_token_tag        TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_iv        TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_tag       TEXT;

-- Allow plaintext columns to be null so rows written by the new code
-- (which only populates the encrypted_* columns) do not violate NOT NULL.
ALTER TABLE google_calendar_tokens
  ALTER COLUMN access_token  DROP NOT NULL,
  ALTER COLUMN refresh_token DROP NOT NULL;
