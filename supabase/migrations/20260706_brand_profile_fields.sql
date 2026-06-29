-- 20260706_brand_profile_fields.sql
-- Match Justin's POV2BattlePack brand profile shape. Adds the structured fields
-- his brand-guide extraction produces and his deck-style-lock consumes, on top
-- of the existing brand_palette (20260703). All additive + nullable + idempotent.
--
--   typography        — { display:{family,weights,usage}, body:{...}, accent:{...} }
--   motif_description  — one-line signature visual motif (e.g. "thin hexagon line-art, low opacity, corner")
--   do_donts           — { do:[...], dont:[...] } design rules
--   cover_formula      — optional title/cover formula

ALTER TABLE brands ADD COLUMN IF NOT EXISTS typography        JSONB;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS motif_description  TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS do_donts           JSONB;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS cover_formula      TEXT;
