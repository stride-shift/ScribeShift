-- 20260629_scheduled_post_targets.sql
-- Wave 2: multi-target LinkedIn posting.
--
-- Adds a child table so one scheduled_posts row can fan-out to multiple LinkedIn
-- destinations (personal profile + one or more admin company Pages). Each
-- destination tracks its own publish status and external post id.
-- The parent row gets a 'partial_failure' roll-up status when only some targets
-- succeed. partial_failure is terminal / user-retry-only — the cron predicate
-- (status='scheduled') never claims it.
--
-- Idempotent: IF NOT EXISTS throughout.

-- ── scheduled_post_targets ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_post_targets (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_post_id    UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  company_id           UUID REFERENCES companies(id) ON DELETE CASCADE,
  -- 'person' | 'organization'
  target_type          TEXT NOT NULL,
  -- urn:li:person:X  |  urn:li:organization:Y
  target_urn           TEXT NOT NULL,
  target_label         TEXT,
  -- pending | posting | posted | failed
  status               TEXT NOT NULL DEFAULT 'pending',
  external_post_id     TEXT,
  external_post_url    TEXT,
  error_message        TEXT,
  retry_count          INTEGER DEFAULT 0,
  posted_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- Efficient lookup by parent post (fan-out loop) and by status (cron recovery)
CREATE INDEX IF NOT EXISTS scheduled_post_targets_post_idx    ON scheduled_post_targets (scheduled_post_id);
CREATE INDEX IF NOT EXISTS scheduled_post_targets_status_idx  ON scheduled_post_targets (status);

ALTER TABLE scheduled_post_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON scheduled_post_targets;
CREATE POLICY "Service role full access" ON scheduled_post_targets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── post_metrics back-link to individual target rows ──────────────────────────
-- Allows metrics-sync to attribute post-level analytics to the exact target
-- (personal profile vs. a specific org Page) rather than the parent post alone.
ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS scheduled_post_target_id UUID
    REFERENCES scheduled_post_targets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS post_metrics_target_idx
  ON post_metrics (scheduled_post_target_id)
  WHERE scheduled_post_target_id IS NOT NULL;
