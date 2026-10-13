-- Add provenance and review metadata for image comparisons and coordinates.
-- Existing media remains in place and is not treated as verified by default.
BEGIN;

ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS creator TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS documented_date TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS license_url TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS media_role TEXT NOT NULL DEFAULT 'gallery';
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS media_context TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS is_illustrative BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS source_accessed_on DATE;

ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS confidence NUMERIC(4,3);
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS reviewed_on DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_media_role_check' AND conrelid = 'heritage_media'::regclass) THEN
    ALTER TABLE heritage_media ADD CONSTRAINT heritage_media_role_check
      CHECK (media_role IN ('gallery', 'historical', 'current', 'reconstruction'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_media_verification_check' AND conrelid = 'heritage_media'::regclass) THEN
    ALTER TABLE heritage_media ADD CONSTRAINT heritage_media_verification_check
      CHECK (verification_status IN ('unverified', 'verified'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_sources_confidence_check' AND conrelid = 'heritage_sources'::regclass) THEN
    ALTER TABLE heritage_sources ADD CONSTRAINT heritage_sources_confidence_check
      CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_sources_review_status_check' AND conrelid = 'heritage_sources'::regclass) THEN
    ALTER TABLE heritage_sources ADD CONSTRAINT heritage_sources_review_status_check
      CHECK (review_status IN ('unreviewed', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Adding review metadata never changes an existing source decision. Coordinate
-- claims require an explicit, source-specific review before they are approved.

CREATE INDEX IF NOT EXISTS idx_verified_heritage_media_role
  ON heritage_media(heritage_id, media_role, verification_status)
  WHERE media_type = 'image';

COMMIT;
