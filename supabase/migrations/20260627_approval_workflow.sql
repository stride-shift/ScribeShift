-- 20260627_approval_workflow.sql
-- Content approval workflow (Wave 1).
--
-- Adds per-post review tracking, a per-company opt-in flag, a comment thread,
-- and an append-only revision log to scheduled_posts.
--
-- GATE: a post under review keeps status='draft' until PUT /api/review/:id/approve
-- flips it to status='scheduled'. The cron predicate (status='scheduled') is
-- NEVER changed — so an unapproved post is invisible to the publisher.
--
-- Idempotent: uses IF NOT EXISTS / IF EXISTS throughout.

-- ── scheduled_posts review columns ─────────────────────────────────────────────
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Partial index to accelerate queue queries (only rows actually in review)
CREATE INDEX IF NOT EXISTS scheduled_posts_review_idx
  ON scheduled_posts (company_id, review_status)
  WHERE review_status <> 'none';

-- ── companies opt-in flag ───────────────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS approval_workflow_enabled BOOLEAN DEFAULT false;

-- ── post_comments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_post_id UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  -- Null when the comment comes from an external (token-based) reviewer
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT,
  author_email TEXT,
  body TEXT NOT NULL,
  -- 'feedback' (change request) | 'note' (internal) | 'approval_note' (approve + note)
  comment_type TEXT DEFAULT 'feedback',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments (scheduled_post_id);

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON post_comments;
CREATE POLICY "Service role full access" ON post_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── post_revisions ──────────────────────────────────────────────────────────────
-- Append-only. Each save of a post under review creates a new row; rows are
-- never updated or deleted here.
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

-- Enforces append-only monotonicity and deduplication
CREATE UNIQUE INDEX IF NOT EXISTS post_revisions_post_rev_idx
  ON post_revisions (scheduled_post_id, revision_number);

ALTER TABLE post_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON post_revisions;
CREATE POLICY "Service role full access" ON post_revisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
