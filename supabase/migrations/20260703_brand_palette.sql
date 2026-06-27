-- Additive/idempotent: adds a JSONB column to store the structured brand palette
-- extracted by OpenAI. Existing primary_color/secondary_color columns are unchanged.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_palette JSONB;
