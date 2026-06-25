-- Invite-only signup. A brand-new account may only be provisioned if an admin
-- invited that email (or an admin created the user directly). Closes the hole
-- where any Google account could self-provision a profile on first sign-in.

CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,                       -- stored lowercased
  role TEXT NOT NULL DEFAULT 'user',         -- user | admin | super_admin
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | accepted | revoked
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

-- At most one pending invite per email.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email ON invitations (lower(email)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations (lower(email));

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON invitations FOR ALL USING (true) WITH CHECK (true);
