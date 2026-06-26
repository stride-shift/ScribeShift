-- The Cloud Run worker reads the job's generation payload (contentTypes,
-- options, brandData, textPrompt, videoUrls) from this column.
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS input JSONB DEFAULT '{}'::jsonb;
