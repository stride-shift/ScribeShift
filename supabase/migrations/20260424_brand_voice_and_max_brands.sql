-- Brand voice fields + per-company brand count limit

-- Brand voice pre-step: ICP, guidelines, writing samples
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS icp_description TEXT,
  ADD COLUMN IF NOT EXISTS brand_guidelines TEXT,
  ADD COLUMN IF NOT EXISTS writing_samples JSONB DEFAULT '[]'::jsonb;

-- Per-company brand count limit. NULL = fall back to plan default in code.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS max_brands INTEGER;
