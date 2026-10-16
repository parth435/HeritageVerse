-- Add reversible public-catalogue membership and identity-preserving aliases.
-- This migration is schema-only: it does not change heritage or user rows.
BEGIN;

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

COMMIT;
