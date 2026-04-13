-- Password reset tokens for custom Resend-based flow.
-- Tokens stored as SHA-256 hash; the raw token is emailed once and never persisted.

CREATE TABLE IF NOT EXISTS password_resets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);

ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON password_resets FOR ALL USING (true) WITH CHECK (true);
