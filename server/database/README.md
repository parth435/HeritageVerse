# HeritageVerse database

These scripts target PostgreSQL and are intended to be run from `server/database` against the database configured for the existing backend. They are additive and do not drop tables or alter existing user columns/data. Run first in a disposable/local database backup or staging database before production.

## Existing authentication dependency

`server/index.js` reads/writes `users.id`, `users.name`, `users.email`, `users.password_hash`, and `users.created_at`; signup hashes with bcrypt and signin compares against `password_hash`. `schema.sql` creates a compatible `users` table only when absent, then checks that those columns exist. It does not rename, alter, or seed users. An existing database still needs live verification of the `users.id` primary/unique key, email uniqueness, types, and constraints before adding dependent foreign keys. No plaintext password column is used.

## Apply scripts

Set `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER` in the shell (and use your approved secure password mechanism, such as `PGPASSWORD` for a one-off local session or `.pgpass`; do not commit credentials). From the repository's `server` directory:

```sh
psql -v ON_ERROR_STOP=1 -f database/schema.sql
psql -v ON_ERROR_STOP=1 -f database/seed.sql
```

To check the scripts against a disposable database, create that database first, then run both commands. To inspect created relations and sample rows:

```sh
psql -c "\\dt"
psql -c "SELECT count(*) FROM heritage; SELECT count(*) FROM heritage_sources; SELECT count(*) FROM heritage_timeline_events;"
```

The scripts were not run here: live PostgreSQL access and the `psql` executable are unavailable. `ON_ERROR_STOP=1` makes the first SQL error stop each run. Repeat the seed command to check idempotence; categories/sites/sources/events use conflict handling or existence checks.

## Schema and API contract

All names are snake_case. `heritage.id` is the detail route key; `slug` is unique and suitable for stable public links. `category_id` references `heritage_categories.id`. Heritage rows carry Parth's fields (`name`, `slug`, `description`, `history`, `cultural_significance`, `architecture`, `historical_period`, `category_id`, `state`, `district`, `latitude`, `longitude`, timestamps) plus `publication_status`. Coordinates allow NULL; only populate them from a verified source. `heritage_sources` records provenance. The seed uses official UNESCO World Heritage Centre URLs. It does not load images because reliable reuse/license details were not established.

- `GET /api/heritage`: query `heritage h JOIN heritage_categories c ON c.id=h.category_id`; default to `h.publication_status='published'`. Filter by `category_id` or category slug, `state`, `district`; search `name`, `description`, `history`, and `cultural_significance` using parameterized `ILIKE`. Paginate with bounded `limit` and `offset`. Order deterministically (for example `h.name, h.id`). Join or separately fetch ordered media (`heritage_media.display_order`).
- `GET /api/heritage/:id`: resolve numeric `heritage.id` as the route contract says; return category plus related ordered rows from `heritage_media`, `heritage_timeline_events`, `heritage_artifacts`, `heritage_architectural_layers`, and `heritage_sources`. Do not expose drafts to public callers.
- Favorites: POST body `{ heritage_id }`, authenticated `user_id` comes from verified session/token, insert into `favorites`; use `ON CONFLICT (user_id, heritage_id) DO NOTHING`. GET filters by authenticated `user_id`. DELETE `/api/favorites/:heritageId` deletes by both authenticated `user_id` and `heritage_id`.
- Visited: same request and ownership pattern using `visited_places`; POST is idempotent with conflict handling. `created_at` records the first visit; if repeat visit history is needed, that requires a separate contract/table decision.
- Reviews: POST body `{ heritage_id, rating, comment }`; rating is integer 1–5. Unique `(user_id, heritage_id)` means one review per user per site; choose upsert to edit it. GET `/:heritageId` returns reviews ordered by `created_at DESC, id DESC` and may join public user name. DELETE `/:id` must constrain both review `id` and authenticated `user_id` unless an admin role is verified.
- Journeys: POST body `{ name, description }`; GET lists only the authenticated user's rows. `GET /:id` must constrain journey by both id and owner and include stops ordered by `stop_order`. Stops POST body `{ heritage_id, stop_order, notes }`; enforce owner access to journey. Unique journey/site and journey/order constraints reject duplicate stops/order values. DELETE stop must enforce journey ownership and both journey id and stop id.
- Admin CRUD: `heritage.publication_status` is `draft`, `published`, or `archived`; admin listing should include all statuses, public listing only published. Content management uses the normalized media, timeline, artifacts, and layer tables; writes should be transactionally associated with a heritage row. The present backend has no role/authorization middleware, so admin authorization must be implemented and verified before enabling these operations.

## Tables and constraints

- `users`: compatible fallback for current auth only; not migrated if already present.
- `heritage_categories` 1-to-many `heritage`.
- `heritage` 1-to-many media, timeline events, artifacts, architecture layers and provenance sources.
- `favorites` and `visited_places`: user/site junctions with composite primary keys; deleting a user or site removes these associations.
- `reviews`: user/site foreign keys, 1–5 check, one review per user per site.
- `journeys` 1-to-many `journey_stops`; stop references site, unique site/order within a journey. Deleting a journey cascades stops; deleting a site referenced by a stop is restricted.
- Timestamps are `TIMESTAMPTZ`; update triggers maintain `updated_at` on editable records. Indexes support category/location/status listing and user/site relationship lookups.

## Seed provenance and verification limits

Seed data contains 25 Indian cultural World Heritage properties (not a claim that this is the complete national inventory). Each row links to its official UNESCO record and has a corresponding inscription timeline event. Descriptive fields are concise paraphrases of UNESCO property records. District labels for multi-site/large areas and historical summaries should receive editorial review. Coordinates and image references are left unset rather than inferred from approximate locations or unlicensed mock links. Verify every row against the linked source and local authority records before public launch.

## Live database checks still required

Before applying to any existing database, inspect `users` columns, primary/unique keys and duplicate emails; inspect existing relation names, ownership, permissions, constraints and data; confirm no application data already uses these names with another shape. Test the schema and seed on a disposable PostgreSQL database matching production's major version, then test on staging and verify foreign-key/type compatibility (especially the existing `users.id`). Confirm idempotent reruns, application role grants, backup/restore, and representative API queries. These checks require PostgreSQL credentials/network access; no live database was audited or modified by this work.
