-- Per-role tour completion flags. The /api/auth/tour-complete endpoint
-- updates one of these depending on the user's role; the frontend reads
-- them on /api/auth/me to decide whether to auto-open the welcome tour.
--
-- Without these columns, every page reload re-opens the tour because
-- `user[completedKey]` is always undefined client-side.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tour_user_completed        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tour_admin_completed       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tour_super_admin_completed BOOLEAN DEFAULT FALSE;
