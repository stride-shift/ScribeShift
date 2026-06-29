-- 20260707_brand_asset_kind.sql
-- Type the brand asset library (Justin's brand_assets.kind). Lets each saved
-- reference image declare WHAT it is, so generation can treat it correctly
-- (a logo is placed; a watermark/pattern is woven into the background; a photo
-- /illustration is a style reference). Additive + nullable + idempotent.
--
--   kind        — logo-primary | logo-mono-light | logo-mono-dark | logo-symbol |
--                 sub-brand-lockup | icon-set | watermark | pattern | motif |
--                 photo | illustration | template | reference | other
--   usage_note  — free-text hint shown to the image model (e.g. "low opacity, corner")
-- (kind is validated in the API route rather than a DB CHECK, to stay flexible.)

ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS kind       TEXT DEFAULT 'reference';
ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS usage_note TEXT;
