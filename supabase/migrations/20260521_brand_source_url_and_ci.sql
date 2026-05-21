-- Remember where a brand was extracted from + carry richer brand context.
--
-- source_url:   shows in the modal next time the user opens the brand so
--               they can see + re-run extraction without re-typing.
-- ci_document_*: a CI / brand identity document (PDF, doc, etc) uploaded
--               by the user. Optional — when set, the extracted plain
--               text is injected into the AI context alongside ICP /
--               guidelines / writing samples.

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS source_url        TEXT,
  ADD COLUMN IF NOT EXISTS ci_document_url   TEXT,
  ADD COLUMN IF NOT EXISTS ci_document_text  TEXT,
  ADD COLUMN IF NOT EXISTS ci_document_name  TEXT;
