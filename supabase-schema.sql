-- ============================================================
-- ScribeShift Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── Companies ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  plan TEXT DEFAULT 'free',
  credit_balance INTEGER DEFAULT 100,
  credit_monthly_limit INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Users (linked to Supabase Auth) ─────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ── Usage Logs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  credits_used INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_company ON usage_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_usage_action ON usage_logs(action);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at DESC);

-- ── Brands ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL DEFAULT '',
  primary_color TEXT DEFAULT '#fbbf24',
  secondary_color TEXT DEFAULT '#38bdf8',
  logo_url TEXT,
  industry TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_user ON brands(user_id);
CREATE INDEX IF NOT EXISTS idx_brands_company ON brands(company_id);

-- ── Generated Content ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  source_summary TEXT,
  options JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_user ON generated_content(user_id);
CREATE INDEX IF NOT EXISTS idx_content_company ON generated_content(company_id);
CREATE INDEX IF NOT EXISTS idx_content_type ON generated_content(content_type);
CREATE INDEX IF NOT EXISTS idx_content_created ON generated_content(created_at DESC);

-- ── Scheduled Posts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  content_id UUID REFERENCES generated_content(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  platform TEXT NOT NULL DEFAULT 'linkedin',
  post_text TEXT NOT NULL,
  post_image_url TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'draft',
  error_message TEXT,
  posted_at TIMESTAMPTZ,
  external_post_id TEXT,
  external_post_url TEXT,
  utm_params JSONB DEFAULT '{}',
  is_boosted BOOLEAN DEFAULT false,
  boost_spend NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_user ON scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_company ON scheduled_posts(company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_at ON scheduled_posts(scheduled_at);

-- ── Post Metrics ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_post_id UUID REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  reactions INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  engagement_rate NUMERIC(5,2),
  is_boosted BOOLEAN DEFAULT false,
  boost_spend NUMERIC(10,2),
  scraped_at TIMESTAMPTZ DEFAULT now(),
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metrics_post ON post_metrics(scheduled_post_id);
CREATE INDEX IF NOT EXISTS idx_metrics_company ON post_metrics(company_id);
CREATE INDEX IF NOT EXISTS idx_metrics_boosted ON post_metrics(is_boosted);

-- ── Leads ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  scheduled_post_id UUID REFERENCES scheduled_posts(id) ON DELETE SET NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  landing_page TEXT,
  referrer_url TEXT,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  ip_hash TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_post ON leads(scheduled_post_id);
CREATE INDEX IF NOT EXISTS idx_leads_event ON leads(event_type);

-- ── Strategy Insights ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategy_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  confidence_score NUMERIC(3,2),
  data_basis JSONB DEFAULT '{}',
  is_applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insights_company ON strategy_insights(company_id);
CREATE INDEX IF NOT EXISTS idx_insights_type ON strategy_insights(insight_type);

-- ── Generated Media (TTS audio, HeyGen videos, images) ─────
CREATE TABLE IF NOT EXISTS generated_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID REFERENCES generated_content(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  file_size_bytes INTEGER,
  duration_seconds NUMERIC(8,2),
  prompt_used TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_content ON generated_media(content_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON generated_media(media_type);

-- ── Social Credentials (encrypted) ──────────────────────────
CREATE TABLE IF NOT EXISTS social_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_label TEXT DEFAULT '',
  encrypted_email TEXT NOT NULL,
  email_iv TEXT NOT NULL,
  email_tag TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_tag TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_login_success BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credentials_user ON social_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_platform ON social_credentials(platform);

-- ── Planner Pillars ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planner_pillars (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  description TEXT DEFAULT '',
  topics JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_pillars_user ON planner_pillars(user_id);

-- ── Planner Content Pieces ──────────────────────────────────
CREATE TABLE IF NOT EXISTS planner_pieces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  pillar_id UUID REFERENCES planner_pillars(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  content_type TEXT DEFAULT '',
  status TEXT DEFAULT 'idea',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_pieces_user ON planner_pieces(user_id);
CREATE INDEX IF NOT EXISTS idx_planner_pieces_pillar ON planner_pieces(pillar_id);
CREATE INDEX IF NOT EXISTS idx_planner_pieces_status ON planner_pieces(status);

-- ── Helper function: deduct credits ─────────────────────────
CREATE OR REPLACE FUNCTION deduct_credits(p_company_id UUID, p_amount INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE companies
  SET credit_balance = GREATEST(0, credit_balance - p_amount),
      updated_at = now()
  WHERE id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Disable RLS for now (using service role key server-side) ─
-- We handle authorization in the Express middleware layer.
-- RLS can be enabled later if we add client-side Supabase access.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_pieces ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (server always uses service role key)
CREATE POLICY "Service role full access" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON usage_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON brands FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON generated_content FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON scheduled_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON post_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON strategy_insights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON generated_media FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON social_credentials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON planner_pillars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON planner_pieces FOR ALL USING (true) WITH CHECK (true);
