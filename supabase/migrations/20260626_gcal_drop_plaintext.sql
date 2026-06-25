-- ============================================================
-- Wave 4 — Google Calendar token encryption (Phase 2 of 2)
--
-- !! RUN ONLY AFTER ALL OF THE FOLLOWING ARE TRUE !!
--   1. 20260625_gcal_token_encryption.sql has been applied.
--   2. The updated server/services/google-calendar.js is deployed (writes
--      encrypted columns only; reads encrypted-first with plaintext fallback).
--   3. bin/encrypt-gcal-tokens.mjs has been run and reports 0 un-migrated rows.
--
-- Verify pre-condition before running:
--   SELECT COUNT(*) FROM google_calendar_tokens
--   WHERE access_token IS NOT NULL AND encrypted_access_token IS NULL;
--   -- must return 0
-- ============================================================

ALTER TABLE google_calendar_tokens
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token;

-- Enforce NOT NULL on the access token encrypted columns
-- (refresh columns remain nullable — matching social_oauth_tokens convention).
ALTER TABLE google_calendar_tokens
  ALTER COLUMN encrypted_access_token SET NOT NULL,
  ALTER COLUMN access_token_iv         SET NOT NULL,
  ALTER COLUMN access_token_tag        SET NOT NULL;
