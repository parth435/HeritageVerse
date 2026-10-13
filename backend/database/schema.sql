-- HeritageVerse PostgreSQL schema
-- Safe additive bootstrap: no table or user is deleted. Existing role casing is normalized.
-- Existing authentication requires users(id, name, email, password_hash, created_at).

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
UPDATE users SET role = lower(role)
 WHERE lower(role) IN ('user', 'admin') AND role <> lower(role);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'name')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'email')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'password_hash')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'created_at') THEN
    RAISE EXCEPTION 'Existing users table is missing an auth-required column (id, name, email, password_hash, created_at). No user-table migration was attempted.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS heritage_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS heritage (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  history TEXT NOT NULL,
  cultural_significance TEXT NOT NULL,
  architecture TEXT NOT NULL,
  historical_period TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES heritage_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  state TEXT NOT NULL,
  district TEXT,
  locality TEXT,
  address TEXT,
  latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
    wikidata_qid TEXT UNIQUE CHECK (wikidata_qid IS NULL OR wikidata_qid ~ '^Q[1-9][0-9]*$'),
  publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE heritage ADD COLUMN IF NOT EXISTS locality TEXT;
ALTER TABLE heritage ADD COLUMN IF NOT EXISTS address TEXT;

CREATE TABLE IF NOT EXISTS heritage_catalog_membership (
  heritage_id INTEGER PRIMARY KEY
    REFERENCES heritage(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  catalogue_key TEXT NOT NULL UNIQUE
    CHECK (catalogue_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_order SMALLINT NOT NULL UNIQUE
    CHECK (display_order BETWEEN 1 AND 30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS heritage_catalog_aliases (
  alias_heritage_id INTEGER PRIMARY KEY
    REFERENCES heritage(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  canonical_heritage_id INTEGER NOT NULL
    REFERENCES heritage(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (alias_heritage_id <> canonical_heritage_id)
);

CREATE INDEX IF NOT EXISTS idx_heritage_catalog_aliases_canonical
  ON heritage_catalog_aliases(canonical_heritage_id);

CREATE TABLE IF NOT EXISTS heritage_slug_aliases (
  slug_alias TEXT PRIMARY KEY
    CHECK (slug_alias ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  heritage_id INTEGER NOT NULL
    REFERENCES heritage(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heritage_slug_aliases_heritage
  ON heritage_slug_aliases(heritage_id);

CREATE TABLE IF NOT EXISTS heritage_sources (
  id SERIAL PRIMARY KEY,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_title TEXT,
  publisher TEXT,
  source_url TEXT NOT NULL,
  source_note TEXT,
  accessed_on DATE,
  claims_supported TEXT[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(4,3),
  review_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (heritage_id, source_url)
);

ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS source_title TEXT;
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS publisher TEXT;
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS accessed_on DATE;
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS claims_supported TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS confidence NUMERIC(4,3);
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE heritage_sources ADD COLUMN IF NOT EXISTS reviewed_on DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_sources_confidence_check' AND conrelid = 'heritage_sources'::regclass) THEN
    ALTER TABLE heritage_sources ADD CONSTRAINT heritage_sources_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_sources_review_status_check' AND conrelid = 'heritage_sources'::regclass) THEN
    ALTER TABLE heritage_sources ADD CONSTRAINT heritage_sources_review_status_check CHECK (review_status IN ('unreviewed', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

UPDATE heritage_sources
SET publisher = COALESCE(publisher, source_name),
    source_title = COALESCE(source_title, source_name),
    claims_supported = CASE
      WHEN cardinality(claims_supported) = 0 THEN ARRAY['description', 'history', 'cultural_significance', 'architecture', 'historical_period']::TEXT[]
      ELSE claims_supported
    END
WHERE publisher IS NULL OR source_title IS NULL OR cardinality(claims_supported) = 0;

CREATE TABLE IF NOT EXISTS heritage_media (
  id SERIAL PRIMARY KEY,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio', 'document')),
  url TEXT NOT NULL,
  caption TEXT,
  alt_text TEXT,
  credit TEXT,
  license TEXT,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  source_url TEXT,
  creator TEXT,
  documented_date TEXT,
  license_url TEXT,
  media_role TEXT NOT NULL DEFAULT 'gallery',
  media_context TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  is_illustrative BOOLEAN NOT NULL DEFAULT FALSE,
  source_accessed_on DATE,
    thumbnail_url TEXT,
    provider TEXT NOT NULL DEFAULT 'manual',
    wikimedia_filename TEXT,
    match_confidence NUMERIC(4,3) CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (heritage_id, url)
);

ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS creator TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS documented_date TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS license_url TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS media_role TEXT NOT NULL DEFAULT 'gallery';
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS media_context TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS is_illustrative BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS source_accessed_on DATE;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS wikimedia_filename TEXT;
ALTER TABLE heritage_media ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(4,3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_media_role_check' AND conrelid = 'heritage_media'::regclass) THEN
    ALTER TABLE heritage_media ADD CONSTRAINT heritage_media_role_check CHECK (media_role IN ('gallery', 'historical', 'current', 'reconstruction'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_media_verification_check' AND conrelid = 'heritage_media'::regclass) THEN
    ALTER TABLE heritage_media ADD CONSTRAINT heritage_media_verification_check CHECK (verification_status IN ('unverified', 'verified'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heritage_media_match_confidence_check' AND conrelid = 'heritage_media'::regclass) THEN
    ALTER TABLE heritage_media ADD CONSTRAINT heritage_media_match_confidence_check CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 1);
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

CREATE TABLE IF NOT EXISTS heritage_timeline_events (
  id SERIAL PRIMARY KEY,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_period TEXT NOT NULL,
  event_date DATE,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  source_id INTEGER REFERENCES heritage_sources(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS heritage_artifacts (
  id SERIAL PRIMARY KEY,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  period TEXT,
  material TEXT,
  source_id INTEGER REFERENCES heritage_sources(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS heritage_architectural_layers (
  id SERIAL PRIMARY KEY,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  source_id INTEGER REFERENCES heritage_sources(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (heritage_id, display_order)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, heritage_id)
);

CREATE TABLE IF NOT EXISTS visited_places (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, heritage_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, heritage_id)
);

CREATE TABLE IF NOT EXISTS journeys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journey_stops (
  id SERIAL PRIMARY KEY,
  journey_id INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE RESTRICT,
  stop_order INTEGER NOT NULL CHECK (stop_order > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (journey_id, heritage_id),
  UNIQUE (journey_id, stop_order)
);

CREATE INDEX IF NOT EXISTS idx_heritage_category ON heritage(category_id);
CREATE INDEX IF NOT EXISTS idx_heritage_state_district ON heritage(state, district);
CREATE INDEX IF NOT EXISTS idx_heritage_status_name ON heritage(publication_status, name);
CREATE INDEX IF NOT EXISTS idx_heritage_timeline_site_order ON heritage_timeline_events(heritage_id, display_order);
CREATE INDEX IF NOT EXISTS idx_media_site_order ON heritage_media(heritage_id, display_order);
CREATE INDEX IF NOT EXISTS idx_verified_heritage_media_role ON heritage_media(heritage_id, media_role, verification_status) WHERE media_type = 'image';
CREATE INDEX IF NOT EXISTS idx_artifacts_site ON heritage_artifacts(heritage_id);
CREATE INDEX IF NOT EXISTS idx_layers_site_order ON heritage_architectural_layers(heritage_id, display_order);
CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON favorites(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visited_user_created ON visited_places(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_site_created ON reviews(heritage_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journeys_user_created ON journeys(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journey_stops_journey_order ON journey_stops(journey_id, stop_order);

CREATE OR REPLACE FUNCTION heritageverse_set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['heritage','heritage_timeline_events','heritage_artifacts','heritage_architectural_layers','reviews','journeys'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = format('trg_%s_updated_at', tbl) AND tgrelid = to_regclass(format('%I.%I', current_schema(), tbl)) AND NOT tgisinternal) THEN
      EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION heritageverse_set_updated_at()', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- =========================================================================
-- ADMIN SYSTEM ADDITIVE EXTENSIONS
-- =========================================================================

-- 1. Ensure users table supports status column
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- 2. Stories table for Editorial CMS
CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  author TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'DRAFT', 'ARCHIVED')),
  published_at TIMESTAMPTZ DEFAULT NOW(),
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Activity logs for Admin audit trail
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);

COMMIT;



