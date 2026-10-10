-- HeritageVerse PostgreSQL schema
-- Safe additive bootstrap: no table is dropped and no existing user rows are changed.
-- Existing authentication requires users(id, name, email, password_hash, created_at).

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS heritage_sources (
  id SERIAL PRIMARY KEY,
  heritage_id INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (heritage_id, source_url)
);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (heritage_id, url)
);

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

-- 1. Ensure users table supports role and status
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER';
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




