-- Per-role product tour completion flags.
-- Each role's tour is tracked independently so a promoted user (e.g. user -> admin)
-- still gets shown the admin tour even if they completed the basic user tour.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tour_user_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tour_admin_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tour_super_admin_completed BOOLEAN NOT NULL DEFAULT FALSE;
