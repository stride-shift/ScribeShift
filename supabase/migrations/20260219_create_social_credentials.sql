CREATE TABLE IF NOT EXISTS social_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  account_label TEXT DEFAULT '',
  encrypted_email TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_tag TEXT NOT NULL,
  email_iv TEXT NOT NULL,
  email_tag TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_login_success BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform, account_label)
);

CREATE INDEX IF NOT EXISTS idx_social_creds_user ON social_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_social_creds_platform ON social_credentials(platform);
CREATE INDEX IF NOT EXISTS idx_social_creds_company ON social_credentials(company_id);
