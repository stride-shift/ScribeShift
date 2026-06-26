-- LinkedIn admin pages / company Pages the user can post to.
-- Populated after OAuth connect; updated by fetchAdminOrganizations().

CREATE TABLE IF NOT EXISTS linkedin_pages (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  oauth_token_id  UUID REFERENCES social_oauth_tokens(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  org_urn         TEXT NOT NULL,          -- urn:li:organization:12345
  org_id          TEXT NOT NULL,          -- numeric part extracted from org_urn
  name            TEXT,
  logo_url        TEXT,
  role            TEXT,                   -- ADMINISTRATOR | DIRECT_SPONSORED_CONTENT_POSTER
  is_active       BOOLEAN DEFAULT true,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_pages_user_id_idx ON linkedin_pages (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS linkedin_pages_user_org_urn_uidx ON linkedin_pages (user_id, org_urn);

ALTER TABLE linkedin_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON linkedin_pages FOR ALL TO service_role USING (true) WITH CHECK (true);
