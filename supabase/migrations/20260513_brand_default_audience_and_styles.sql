-- Per-brand defaults so users don't have to re-pick audience and visual
-- style on every generation. Both are nullable — when unset, the CreateView
-- falls back to its existing dropdown defaults.

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS default_audience TEXT,
  ADD COLUMN IF NOT EXISTS default_image_styles JSONB DEFAULT '[]'::jsonb;
