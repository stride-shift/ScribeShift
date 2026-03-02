-- ============================================================
-- Social OAuth Tokens table
-- Stores encrypted OAuth access/refresh tokens for platforms
-- that use official API integration (e.g. LinkedIn).
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS social_oauth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  access_token_tag TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  refresh_token_iv TEXT,
  refresh_token_tag TEXT,
  token_expires_at TIMESTAMPTZ,
  platform_user_id TEXT,
  platform_user_name TEXT,
  scope TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON social_oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_platform ON social_oauth_tokens(platform);

ALTER TABLE social_oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON social_oauth_tokens FOR ALL USING (true) WITH CHECK (true);
