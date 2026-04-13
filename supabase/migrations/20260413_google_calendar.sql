-- Google Calendar integration — per-user OAuth tokens + link calendar event ids to posts.

CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scope TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  calendar_id TEXT DEFAULT 'primary',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_cal_user ON google_calendar_tokens(user_id);

ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON google_calendar_tokens FOR ALL USING (true) WITH CHECK (true);

-- Track the Google Calendar event id created for each scheduled post so we can
-- update/delete it when the post is edited or cancelled.
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS google_event_id TEXT;
