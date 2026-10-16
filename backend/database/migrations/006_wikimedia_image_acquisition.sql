-- Add a resumable, reviewable Wikidata/Wikimedia image acquisition pipeline.
-- Existing heritage rows and media remain in place and are not promoted.
BEGIN;

ALTER TABLE heritage ADD COLUMN IF NOT EXISTS wikidata_qid TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_wikidata_qid_check' AND conrelid = 'heritage'::regclass) THEN
    ALTER TABLE heritage ADD CONSTRAINT heritage_wikidata_qid_check
      CHECK (wikidata_qid IS NULL OR wikidata_qid ~ '^Q[1-9][0-9]*$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_heritage_wikidata_qid
  ON heritage(wikidata_qid) WHERE wikidata_qid IS NOT NULL;

ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS wikimedia_filename TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(4,3);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_media_match_confidence_check' AND conrelid = 'heritage_media'::regclass) THEN
    ALTER TABLE heritage_media ADD CONSTRAINT heritage_media_match_confidence_check
      CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 1);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_heritage_media_wikimedia_file
  ON heritage_media(heritage_id, wikimedia_filename)
  WHERE provider = 'wikimedia' AND wikimedia_filename IS NOT NULL;

CREATE TABLE IF NOT EXISTS heritage_image_acquisition (
  heritage_id INTEGER PRIMARY KEY REFERENCES heritage(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'wikimedia',
  status TEXT NOT NULL CHECK (status IN ('verified', 'needs_review', 'not_found', 'failed')),
  match_confidence NUMERIC(4,3) CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 1),
  matched_qid TEXT CHECK (matched_qid IS NULL OR matched_qid ~ '^Q[1-9][0-9]*$'),
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidates) = 'array'),
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_attempt_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS heritage_entity_matches (
  heritage_id INTEGER PRIMARY KEY REFERENCES heritage(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('matched', 'needs_review', 'not_found', 'failed')),
  matched_qid TEXT CHECK (matched_qid IS NULL OR matched_qid ~ '^Q[1-9][0-9]*$'),
  match_confidence NUMERIC(4,3) CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 1),
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidates) = 'array'),
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_attempt_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS heritage_provider_cache (
  cache_key TEXT PRIMARY KEY,
  response JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_heritage_provider_cache_expiry
  ON heritage_provider_cache(expires_at);

COMMIT;
