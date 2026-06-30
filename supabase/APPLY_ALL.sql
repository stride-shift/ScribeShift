-- ============================================================================
-- ScribeShift — COMPLETE schema top-up
-- ----------------------------------------------------------------------------
-- One paste-once block with every additive migration the current code depends
-- on, in dependency order. EVERY statement is idempotent (IF NOT EXISTS /
-- DROP POLICY IF EXISTS / ADD COLUMN IF NOT EXISTS), so running the whole thing
-- is SAFE whether or not parts are already applied.
--
-- Assumes the base schema already exists (users, companies, brands,
-- scheduled_posts, social_oauth_tokens, post_metrics, password_resets,
-- google_calendar_tokens, social_credentials). It does — your app runs.
--
-- NOT included (apply separately, on purpose):
--   * 20260608_metrics_cron.sql  -> needs Vault secrets + pg_cron + the
--     /api/cron/refresh-metrics endpoint live first.
--   * 20260626_gcal_drop_plaintext.sql -> DESTRUCTIVE; only after
--     bin/encrypt-gcal-tokens.mjs reports 0 un-migrated rows.
--
-- Run in: Supabase Dashboard -> SQL Editor. Paste all, run once.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════
-- 1. Async generation + invites + analytics history  (20260608 set)
-- ════════════════════════════════════════════════════════════════════

-- invitations ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email ON invitations (lower(email)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations (lower(email));
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON invitations;
CREATE POLICY "Service role full access" ON invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- generation_jobs (+ input column) ------------------------------------
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  content_types TEXT[] DEFAULT '{}',
  progress JSONB DEFAULT '{}'::jsonb,
  result JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_time ON generation_jobs(user_id, created_at);
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS input JSONB DEFAULT '{}'::jsonb;
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own jobs" ON generation_jobs;
CREATE POLICY "Users read own jobs" ON generation_jobs
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access" ON generation_jobs;
CREATE POLICY "Service role full access" ON generation_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- account_metrics_history --------------------------------------------
CREATE TABLE IF NOT EXISTS account_metrics_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  followers INTEGER,
  following INTEGER,
  posts_count INTEGER,
  profile_views_30d INTEGER,
  reach_30d INTEGER,
  impressions_30d INTEGER,
  engagement_30d INTEGER,
  captured_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_amh_user_platform_time ON account_metrics_history(user_id, platform, captured_at);
CREATE INDEX IF NOT EXISTS idx_amh_company_time ON account_metrics_history(company_id, captured_at);
ALTER TABLE account_metrics_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON account_metrics_history;
CREATE POLICY "Service role full access" ON account_metrics_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════
-- 2. Approval workflow + comments + revisions  (20260627)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS scheduled_posts_review_idx
  ON scheduled_posts (company_id, review_status)
  WHERE review_status <> 'none';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS approval_workflow_enabled BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_post_id UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT,
  author_email TEXT,
  body TEXT NOT NULL,
  comment_type TEXT DEFAULT 'feedback',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments (scheduled_post_id);
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON post_comments;
CREATE POLICY "Service role full access" ON post_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS post_revisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_post_id UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  revision_number INT NOT NULL,
  post_text TEXT,
  post_media_url TEXT,
  post_media_type TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS post_revisions_post_rev_idx
  ON post_revisions (scheduled_post_id, revision_number);
ALTER TABLE post_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON post_revisions;
CREATE POLICY "Service role full access" ON post_revisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════
-- 3. Per-post image mode  (20260630)   [needs post_revisions above]
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS image_mode TEXT DEFAULT 'auto';
ALTER TABLE post_revisions  ADD COLUMN IF NOT EXISTS image_mode TEXT DEFAULT 'auto';


-- ════════════════════════════════════════════════════════════════════
-- 4. LinkedIn admin Pages  (20260628)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS linkedin_pages (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  oauth_token_id  UUID REFERENCES social_oauth_tokens(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  org_urn         TEXT NOT NULL,
  org_id          TEXT NOT NULL,
  name            TEXT,
  logo_url        TEXT,
  role            TEXT,
  is_active       BOOLEAN DEFAULT true,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS linkedin_pages_user_id_idx ON linkedin_pages (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS linkedin_pages_user_org_urn_uidx ON linkedin_pages (user_id, org_urn);
ALTER TABLE linkedin_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON linkedin_pages;
CREATE POLICY "Service role full access" ON linkedin_pages
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════
-- 5. Multi-target LinkedIn posting  (20260629)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scheduled_post_targets (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_post_id    UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  company_id           UUID REFERENCES companies(id) ON DELETE CASCADE,
  target_type          TEXT NOT NULL,
  target_urn           TEXT NOT NULL,
  target_label         TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',
  external_post_id     TEXT,
  external_post_url    TEXT,
  error_message        TEXT,
  retry_count          INTEGER DEFAULT 0,
  posted_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_post_targets_post_idx   ON scheduled_post_targets (scheduled_post_id);
CREATE INDEX IF NOT EXISTS scheduled_post_targets_status_idx ON scheduled_post_targets (status);
ALTER TABLE scheduled_post_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON scheduled_post_targets;
CREATE POLICY "Service role full access" ON scheduled_post_targets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS scheduled_post_target_id UUID
    REFERENCES scheduled_post_targets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS post_metrics_target_idx
  ON post_metrics (scheduled_post_target_id)
  WHERE scheduled_post_target_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════
-- 6. Overdue flag  (20260702)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS overdue_since TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS scheduled_posts_overdue_idx
  ON scheduled_posts (overdue_since) WHERE overdue_since IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════
-- 7. Brand palette  (20260703)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_palette JSONB;


-- ════════════════════════════════════════════════════════════════════
-- 8. Per-platform image variants  (20260701)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_image_variants (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_post_id  UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  company_id         UUID REFERENCES companies(id) ON DELETE CASCADE,
  platform           TEXT NOT NULL,
  storage_url        TEXT NOT NULL,
  aspect             TEXT,
  width              INTEGER,
  height             INTEGER,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_image_variants_post_idx ON post_image_variants (scheduled_post_id);
CREATE UNIQUE INDEX IF NOT EXISTS post_image_variants_post_platform_uniq
  ON post_image_variants (scheduled_post_id, platform);
ALTER TABLE post_image_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON post_image_variants;
CREATE POLICY "Service role full access" ON post_image_variants
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════
-- 9. Brand asset library  (20260704)   <-- the one you're missing now
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS brand_assets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  storage_url TEXT NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_assets_brand_idx ON brand_assets (brand_id);
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON brand_assets;
CREATE POLICY "Service role full access" ON brand_assets
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════
-- 10. Google Calendar token encryption — Phase 1  (20260625)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE google_calendar_tokens
  ADD COLUMN IF NOT EXISTS encrypted_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS access_token_iv         TEXT,
  ADD COLUMN IF NOT EXISTS access_token_tag        TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_iv        TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_tag       TEXT;
ALTER TABLE google_calendar_tokens ALTER COLUMN access_token  DROP NOT NULL;
ALTER TABLE google_calendar_tokens ALTER COLUMN refresh_token DROP NOT NULL;


-- ════════════════════════════════════════════════════════════════════
-- 11. RLS hardening  (20260625_fix_rls)   [run last: needs tables above]
-- ════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Service role full access" ON generation_jobs;
CREATE POLICY "Service role full access" ON generation_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON account_metrics_history;
CREATE POLICY "Service role full access" ON account_metrics_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON invitations;
CREATE POLICY "Service role full access" ON invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON social_oauth_tokens;
CREATE POLICY "Service role full access" ON social_oauth_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON password_resets;
CREATE POLICY "Service role full access" ON password_resets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON google_calendar_tokens;
CREATE POLICY "Service role full access" ON google_calendar_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE social_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON social_credentials;
CREATE POLICY "Service role full access" ON social_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════
-- 12. Brand profile fields  (20260706) — typography/motif/do-don'ts/cover
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE brands ADD COLUMN IF NOT EXISTS typography        JSONB;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS motif_description  TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS do_donts           JSONB;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS cover_formula      TEXT;

-- ════════════════════════════════════════════════════════════════════
-- 13. Typed brand assets  (20260707)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS kind       TEXT DEFAULT 'reference';
ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS usage_note TEXT;

-- ════════════════════════════════════════════════════════════════════
-- 14. Feedback recipient  (20260708)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS review_assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS scheduled_posts_review_assigned_idx
  ON scheduled_posts (review_assigned_to) WHERE review_assigned_to IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- 15. References library  (20260709)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_references (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id     UUID REFERENCES companies(id) ON DELETE SET NULL,
  storage_url    TEXT NOT NULL,
  filename       TEXT,
  mime_type      TEXT,
  kind           TEXT DEFAULT 'image',
  extracted_text TEXT,
  purposes       TEXT[] DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_references_user_idx ON ai_references (user_id);
ALTER TABLE ai_references ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON ai_references;
CREATE POLICY "Service role full access" ON ai_references
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- NOTE: the generation-jobs stall sweeper (20260705) is a pg_cron job, applied
-- separately — see supabase/migrations/20260705_generation_jobs_stall_sweeper.sql.

-- ── done ──
