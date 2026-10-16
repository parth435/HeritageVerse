-- Additive source metadata for inline citations. Existing source rows and
-- heritage relationships are retained; no claims are added when unknown.
BEGIN;

ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS source_title TEXT;
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS publisher TEXT;
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS accessed_on DATE;
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS claims_supported TEXT[] NOT NULL DEFAULT '{}';

UPDATE heritage_sources
SET publisher = COALESCE(publisher, source_name),
    source_title = COALESCE(source_title, source_name),
    claims_supported = CASE
      WHEN cardinality(claims_supported) = 0 THEN ARRAY['description', 'history', 'cultural_significance', 'architecture', 'historical_period']::TEXT[]
      ELSE claims_supported
    END
WHERE publisher IS NULL OR source_title IS NULL OR cardinality(claims_supported) = 0;

COMMIT;
