# HeritageVerse database

These scripts target PostgreSQL and are intended to be run against the database explicitly configured for the backend. They do not drop tables or overwrite existing application records; the schema adds `users.role` when needed and existing accounts receive the `user` default. Back up and positively identify the target before making schema changes; validate against a disposable/local database before production.

## Existing authentication dependency

`backend/index.js` reads/writes `users.id`, `users.name`, `users.email`, `users.password_hash`, and `users.created_at`; signup hashes with bcrypt and signin compares against `password_hash`. `schema.sql` creates a compatible `users` table only when absent, then checks that those columns exist. It does not rename, alter, or seed users. An existing database still needs live verification of the `users.id` primary/unique key, email uniqueness, types, and constraints before adding dependent foreign keys. No plaintext password column is used.

## Apply scripts

Production and new local setups use one `DATABASE_URL` PostgreSQL connection
string, stored in `backend/.env` locally and in the host's secret store for a
deployment. Existing loopback-only `DB_*` local settings remain supported if
`DATABASE_URL` is absent; production rejects them. The separate `psql` CLI can
use its standard `PGHOST`, `PGPORT`,
`PGDATABASE`, and `PGUSER` settings in the shell; use the password prompt or an
approved local password mechanism such as `.pgpass`, and never commit
credentials. From the repository root:

```powershell
psql -v ON_ERROR_STOP=1 -f backend/database/schema.sql
psql -v ON_ERROR_STOP=1 -f backend/database/seed.sql
```

For an existing database created before role-based administration was introduced, apply the additive role migration before starting a backend that reads `users.role`:

```sh
psql -v ON_ERROR_STOP=1 -f database/migrations/001_add_user_roles.sql
```

The canonical `schema.sql` already adds `users.role` with the default `user` role and its check constraint. When applying the full schema, do not apply the separate role migration again; use that migration only when updating an existing database without applying the canonical schema.

Citation metadata and source-provided locality/address fields are additive migrations `002_add_citation_metadata.sql` and `003_add_heritage_locality.sql`. Apply them in numeric order to an existing database before deploying code that reads those columns. They retain existing source and heritage rows and backfill source titles/publishers from existing source names.

Migration `011_add_user_status.sql` adds the `users.status` column for existing
databases, gives accounts with no status `ACTIVE`, normalizes recognized status
values, and constrains the result to `ACTIVE` or `SUSPENDED`. Unrecognized
legacy values are set to `SUSPENDED` so they cannot silently regain access.
Migration `012_add_activity_logs.sql` creates the existing schema's admin audit
table when upgrading a database that does not yet have it. Both migrations are
repeatable and additive; they do not rebuild tables or remove user data. Apply
numbered migrations in order after the schema/content baseline they depend on.

Migration `013_maharashtra_curated_catalogue.sql` sets public catalogue
membership to the 30 destinations in `selected-catalogue.json`, all in
Maharashtra. It reuses existing Mumbai and Panhala identities, preserves the
old Panhala slug as an alias, and adds the other curated records with source
references and coordinates. It removes only out-of-scope membership rows;
heritage rows, media, citations, favorites, visits, reviews, journeys, and stops
remain in place. Those older records are excluded from public catalogue list,
detail, map, search, and facets while they are outside membership. The migration
does not delete or archive them. It is repeatable and refuses conflicting
coordinates rather than silently replacing them. Existing archive status is
preserved; the migration rolls back if a selected record is archived, rather
than silently publishing it again. Migration `014_add_heritage_country.sql`
adds a nullable country field and sets `India` only for the selected Maharashtra
members, leaving unrelated legacy rows unchanged.

Migration `015_correct_cave_chronologies.sql` corrects Ajanta's two separate
excavation phases and extends Ellora's period through the 12th century using
UNESCO's current site histories. It only changes records that still contain the
exact prior text; it preserves source-review decisions and user relationships
and is safe to reapply.

`schema.sql` also adds and constrains `users.status` and creates
`activity_logs`, so fresh schema setup and migration-based upgrades converge
on the same account and audit structures. `migration-smoke.js` checks fresh
setup and a legacy fixture with the status column and audit table removed,
verifies legacy favorites/visits/reviews/journeys remain, and rolls back both
fixtures. It refuses production and non-loopback database targets.

The migration gives every existing account the least-privileged `user` role. After independently verifying an account owner, promote the initial administrator with an audited, parameterized database operation; do not expose role promotion through signup or profile APIs.

Manual administrator provisioning procedure: first verify the person's identity and exact existing account email out of band; never create an account or change a role through signup/profile APIs. Confirm the database target and account ID, then use the guarded script, which requires the verified identity flag, operator name, exact ID/email, explicit confirmation, a transaction, the same advisory lock as admin APIs, an active account, and an audit-log row:

```powershell
node backend/database/promote-admin.js --user-id 123 --email "exact-existing-account@example.com" --identity-verified --operator "Verified operator" --confirm PROMOTE
```

The script defaults to loopback-only. In a separate controlled maintenance session, a positively identified remote deployment database additionally requires `--allow-external-database`; never use that flag casually. This task did not run the script against any database. After provisioning, verify the audit row and use a fresh authenticated session. Do not grant administrator access when identity or account ownership cannot be confirmed.

The unauthenticated admin API returns 401 and ordinary accounts receive 403. Verify administrator CRUD with a confirmed active administrator in a disposable or staging environment after following the provisioning procedure above. Do not promote an account solely to clear a verification gap.

To check the scripts against a disposable database, create that database first, then run both commands. To inspect created relations and sample rows:

```sh
psql -c "\\dt"
psql -c "SELECT count(*) FROM heritage; SELECT count(*) FROM heritage_sources; SELECT count(*) FROM heritage_timeline_events;"
```

## Nearby location search

Nearby distance filtering uses only the 30-place selected public catalogue and
the existing source-verified coordinate fields. The browser fetches all bounded
catalogue pages and computes straight-line distances locally, so precise GPS
coordinates are not sent to HeritageVerse. Manual place-name searches use
`GET /api/locations/search?q=...`; results are validated and attributed to
OpenStreetMap, cached in memory for 24 hours, and rate-limited per client and
per backend process. Set `GEOCODER_USER_AGENT` to an identifying application
string with an operator contact. `GEOCODER_SEARCH_URL` may only identify the
HTTPS endpoint `https://nominatim.openstreetmap.org/search`; other providers
are rejected so the returned OpenStreetMap attribution stays accurate. The
built-in public Nominatim endpoint is
appropriate only when the deployment can keep aggregate traffic within its
usage policy; multiple backend replicas need a shared limiter/cache or a
contracted provider. Map tiles and externally opened directions receive the
selected area/origin only when the visitor chooses those features.

`ON_ERROR_STOP=1` makes the first SQL error stop each run. The seed script is idempotent and preserves IDs and user relationships. It inserts missing catalog rows and sources; its only existing-record update is the explicitly documented category correction for the Taj Mahal, Humayun's Tomb, and Sanchi. Review existing counts before seeding an established database.

`schema.sql`, standalone migrations, and `seed.sql` are transaction-wrapped.
`npm.cmd run test:migrations` exercises the fresh initialization order
(`schema.sql`, `seed.sql`, then migrations 001–015) and a separate legacy
natural-key fixture. Both schemas run inside a local transaction and are rolled
back. The checks cover selected catalogue membership and addresses, optional
duplicate aliases, source-review preservation, existing user relationships,
legacy relationship preservation after catalogue exclusion, archive-status
protection, migration idempotency, country field population, and rollback. Legacy fixture IDs are generated; the fresh path does
not inject legacy rows. The command refuses production mode and non-loopback
database hosts.

## Schema and API contract

All names are snake_case. `heritage.id` is the detail route key; `slug` is unique and suitable for stable public links. `category_id` references `heritage_categories.id`. Heritage rows carry `name`, `slug`, `description`, `history`, `cultural_significance`, `architecture`, `historical_period`, `category_id`, `state`, optional `country`, `district`, `latitude`, `longitude`, timestamps, and `publication_status`. Coordinates allow NULL; only populate them from a verified source. `heritage_sources` records provenance. Public heritage endpoints additionally require `heritage_catalog_membership`; the current manifest contains 30 Maharashtra destinations in India. The broader legacy rows remain stored and retain their relationships.

- `GET /api/heritage`: query published rows joined to `heritage_catalog_membership` and `heritage_categories`. Filter by `category_id` or category slug, `state`, and `district`; search `name`, `description`, `history`, and `cultural_significance` using parameterized `ILIKE`. Paginate with bounded `limit` and `offset`. Public order follows `membership.display_order`. Public media contains only verified, non-illustrative images; unverified candidates stay in the admin acquisition review data.
- `GET /api/heritage/:id`: resolve numeric `heritage.id`; public access requires a published catalogue member. Authenticated owners may still resolve a published out-of-catalogue record when an existing favorite or visit links it. Return category plus related ordered rows from `heritage_media`, `heritage_timeline_events`, `heritage_artifacts`, `heritage_architectural_layers`, and `heritage_sources`. Do not expose drafts or archived records to public callers.
- Favorites: POST body `{ heritage_id }`, authenticated `user_id` comes from verified session/token, insert into `favorites`; use `ON CONFLICT (user_id, heritage_id) DO NOTHING`. GET filters by authenticated `user_id`. DELETE `/api/favorites/:heritageId` deletes by both authenticated `user_id` and `heritage_id`.
- Visited: same request and ownership pattern using `visited_places`; POST is idempotent with conflict handling. `created_at` records the first visit; if repeat visit history is needed, that requires a separate contract/table decision.
- Reviews: POST body `{ heritage_id, rating, comment }`; rating is integer 1–5. Unique `(user_id, heritage_id)` means one review per user per site; choose upsert to edit it. GET `/:heritageId` returns reviews ordered by `created_at DESC, id DESC` and may join public user name. DELETE `/:id` must constrain both review `id` and authenticated `user_id` unless an admin role is verified.
- Journeys: POST body `{ name, description }`; GET lists only the authenticated user's rows. `GET /:id` must constrain journey by both id and owner and include stops ordered by `stop_order`. Stops POST body `{ heritage_id, stop_order, notes }`; enforce owner access to journey. Unique journey/site and journey/order constraints reject duplicate stops/order values. DELETE stop must enforce journey ownership and both journey id and stop id.
- Admin CRUD: `heritage.publication_status` is `draft`, `published`, or `archived`; admin listing includes all statuses, public listing only published. Admin routes require authentication and check the current `users.role` in PostgreSQL; signup and profile updates cannot grant a role. Content management uses the normalized media, timeline, artifacts, and layer tables; writes should be transactionally associated with a heritage row.

## Tables and constraints

- `users`: compatible fallback for current auth only; not migrated if already present.
- `heritage_categories` 1-to-many `heritage`.
- `heritage` 1-to-many media, timeline events, artifacts, architecture layers and provenance sources.
- `favorites` and `visited_places`: user/site junctions with composite primary keys; deleting a user or site removes these associations.
- `reviews`: user/site foreign keys, 1–5 check, one review per user per site.
- `journeys` 1-to-many `journey_stops`; stop references site, unique site/order within a journey. Deleting a journey cascades stops; deleting a site referenced by a stop is restricted.
- Timestamps are `TIMESTAMPTZ`; update triggers maintain `updated_at` on editable records. Indexes support category/location/status listing and user/site relationship lookups.

## Seed provenance and verification limits

The UNESCO starter set contains 25 Indian cultural World Heritage properties (not a claim that this is the complete national inventory). Two additional museum records have official museum citations. The seed corrects known category assignments for the Taj Mahal, Humayun's Tomb, and Sanchi without changing IDs or relationships. `004_add_unesco_verified_coordinates.sql` is an additive, repeatable migration for nine exact UNESCO property points; it leaves all other coordinate pairs unset and records each coordinate source claim. Apply it only after migrations 002 and 003, using `node backend/database/apply-migration.js 004_add_unesco_verified_coordinates.sql --apply` against a verified local, non-production database.

`005_verified_media_and_coordinate_review.sql` adds creator, image source page,
documented date, license URL, comparison role, context, and verification fields
to media. It also adds source confidence and review metadata to provenance
records. Existing media stays unverified by default. Adding review metadata
does not approve coordinate claims; existing review decisions are preserved.
Each coordinate citation requires its own explicit review. Migration 009 only
marks its four documented UNESCO map citations approved when the stored point
exactly matches the cited property point; conflicts retain their existing
review state and cause validation to fail if that required citation is not
approved.

The verified Taj Mahal Then & Now pair is listed in
`database/source-data/then-now-images.json`. Wikimedia Commons identifies the
historical photograph as a view from the riverbed, created by Francis Frith
about 1855–1865 and supplied by The J. Paul Getty Museum; its file page lists
CC0 1.0. The contemporary photo by Dudva is dated 4 October 2025 and also lists
CC0 1.0. Their viewpoints are not described as camera-matched. After applying
migration 005, run `node backend/database/import-media.js` to review the dry-run
report, then `node backend/database/import-media.js --apply` to add the records.
Apply mode only targets a local, non-production database and uses
`ON CONFLICT DO NOTHING`; existing image metadata is never overwritten. The
importer accepts only reviewed records with HTTPS sources and an allowlisted
license.

## Automated Wikimedia image acquisition

Migration `006_wikimedia_image_acquisition.sql` adds an optional Wikidata QID
to each existing heritage row, Wikimedia asset metadata to `heritage_media`,
per-site acquisition status/candidate records, and a provider response cache.
It does not create heritage rows or promote existing media. Existing verified
primary images are skipped by default. Candidate assets are stored only when
the name/location match reaches confidence `0.95` or higher and Commons supplies
a safe image URL, a file page, attribution/creator information, and license
name and URL. Ambiguous matches and incomplete licenses remain `needs_review`.
Imported assets remain `gallery` images; the pipeline does not infer that a
photograph is historical or date it from its upload timestamp.

The Wikimedia User-Agent uses the public HeritageVerse repository URL by
default. Set `HERITAGEVERSE_WIKIMEDIA_CONTACT` in `backend/.env` to override it
with the operator's HTTPS project URL or contact email. The importer uses
`maxlag`, bounded concurrency, request pacing, timeouts, and retry/backoff.
Run migration 006 once against a verified local, non-production database:

```sh
node backend/database/apply-migration.js 006_wikimedia_image_acquisition.sql --apply
```

The CLI is dry-run by default. With no explicit IDs it reads only current
`heritage_catalog_membership` records, processes records in batches of 20, and
prints progress plus counts for verified
candidates, review candidates, no-image results, failures, and skipped rows.
No database rows are changed in dry-run mode:

```sh
npm run images:import -- --dry-run --batch-size 20 --delay-ms 1000 --concurrency 1
```

Use `--limit N` to cap eligible records, `--heritage-id ID` to scope a run to
one existing place, and `--resume` to continue an interrupted apply run while
skipping already completed review/not-found/verified records. Add
`--retry-failed` to retry failures; with `--resume`, both pending and failed
records are selected. `--ids 12,34` remains available for a selected set.

Review that report before explicitly applying it to a local non-production
database:

```sh
npm run images:import -- --apply --batch-size 20 --delay-ms 1000 --concurrency 1
```

Use `--commons-search` to run a destination-by-destination Commons search for
catalogue destinations that do not yet have both verified current and
historical images. It searches Commons file pages, loads image-page
attribution metadata, and retains destination-name, locality/district, and
Commons-coordinate evidence in the admin review queue. A filename, location
score, or successful image-byte check does not prove that the visible subject
is correct, so this mode never writes public `heritage_media` rows. It only
updates the idempotent `heritage_image_acquisition` review record:

```sh
npm run images:import -- --apply --commons-search
```

For a subset, add `--ids 12,34`. Apply mode commits each record separately;
`--refresh` rechecks selected rows and never updates or deletes existing image
records. `ON CONFLICT` prevents duplicate image assets and the acquisition
record is upserted in place. The concurrency limit is 3 and request spacing
cannot be reduced below one second. Wikimedia responses are cached in the
database for 30 days on apply runs; dry-run responses are cached only for that
process.

An exact candidate manifest can place supplied URLs and their unverified
attribution claims in the admin image review queue without making upstream
requests. Candidates do not enter `heritage_media` or public responses until
an operator records a visual match in the manifest and reruns the importer.
Commons metadata and image bytes are checked again during that approved run;
candidate creator/license claims are never copied as authoritative metadata.
The command writes only to a local, non-production database:

```sh
npm run images:import -- --apply --candidate-manifest database/source-data/selected-catalogue-wikimedia-candidates.json --queue-candidates
```

The normal `--apply --candidate-manifest` mode remains blocked until each
candidate has explicit visual-match approval. A candidate stays review-only
until an operator visually confirms the exact file for the destination. The
approved import stores Commons source, attribution, license, and image metadata
after a fresh file-page lookup and byte validation.

The importer uses Wikidata entity search only when a record lacks a QID. It
compares normalized labels/aliases, India/state/locality context, and available
coordinates, and sends close or ambiguous matches to review. If P18 is absent
or yields no usable file, it searches Commons using the heritage name and
location plus a coordinate proximity search where coordinates exist. It never
fetches arbitrary URLs supplied by a record: API requests target Wikidata and
Commons, and image URLs are restricted to Wikimedia upload hosts. For
Wikimedia's client-identification and rate guidance, see the
[Action API etiquette](https://www.mediawiki.org/wiki/API:Etiquette/en) and
[Wikimedia API rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits).

`heritage_entity_matches` is the separate entity-discovery review queue. Run it
before image import when you want to confirm QIDs independently; only a
high-confidence, unambiguous result is written to the existing heritage row.
The image importer also performs this discovery inline for any remaining
missing QIDs.

```sh
node backend/database/discover-wikidata-entities.js --dry-run --batch-size 20 --delay-ms 1000
node backend/database/discover-wikidata-entities.js --apply --batch-size 20 --delay-ms 1000
npm run images:import -- --dry-run --batch-size 20 --delay-ms 1000
npm run images:import -- --apply --batch-size 20 --delay-ms 1000
```

`--retry-failed` retries failed entity discoveries or image imports,
respectively. Both commands support `--ids`, `--concurrency` (maximum 3),
`--refresh`, and dry-run by default. Each apply command writes its results one
heritage ID at a time, so successful work is retained if a later batch stops.

`heritage_image_acquisition` records `verified`, `needs_review`, `not_found`,
or `failed`, along with candidates and retry timestamps. `heritage_media`
retains the original URL and attribution/license fields and adds the thumbnail,
filename, provider, and match confidence. The heritage API includes these fields
additively. Shared cards, map popups, detail pages, favorites, and Then & Now use
the Commons thumbnail when available and fall back to the original URL. Then &
Now keeps undated gallery photographs separate from its documented historical
and contemporary comparison pair.

The optional ASI importer reads the official ASI Centrally Protected Monuments/Sites PDF at `https://asi.nic.in/pdf/CPM_List.pdf`. Keep the source copy at `database/source-data/ASI_CPM_List.pdf`; it requires Poppler's `pdftotext` executable and always attributes its records to that official source. From the repository root, run `node backend/database/import-asi.js` for a dry run. It accepts only complete single-line entries, rejects wrapped/incomplete entries, validates stable slugs and requires at least 500 rows. It adds a provenance citation and explicitly leaves historical details, coordinates, images, and visiting information unrecorded when the source does not supply them. Only after reviewing the dry-run summary, run `node backend/database/import-asi.js --apply` to insert records using additive `ON CONFLICT DO NOTHING` upserts in a transaction. Apply mode refuses remote and production database hosts; dry-run does not write. Existing records and user relationships are preserved. The importer reports the accepted count; query the database after import to establish the actual count and state coverage.

Historical verification on 10 October 2026 found 2,190 published legacy records across 32 states/territories. After migration 013 on the local loopback database, the full legacy record set remains stored and the public membership audit reports 30 published Maharashtra destinations, 30 exact approved coordinate citations, 30 addresses, and preserved user-relationship counts. Image import/attribution coverage is tracked separately by `npm run verify:catalog`; a passing coordinate audit alone does not establish complete image coverage.

The OSRM adapter reads `ROUTING_BASE_URL` from the backend environment as the provider base URL and appends `/route/v1/driving/{lon,lat;...}` itself. For a self-hosted service, set e.g. `ROUTING_BASE_URL=http://127.0.0.1:5001` in `backend/.env` and restart the backend. A one-off live adapter check against `https://router.project-osrm.org` returned a route between the verified Taj Mahal and Agra Fort coordinates: 3,760.8 m, estimated 371.2 seconds, 107 geometry points, and turn steps. The OSRM demo policy limits use to reasonable non-commercial requests at no more than one request per second and gives no uptime guarantee; because HeritageVerse's commercial status is unspecified, no demo URL was persisted in `backend/.env`. Use a self-hosted or contracted service for production. This implementation supports driving only, preserves journey stop order, and reports provider-estimated duration without live traffic or route optimization. If routing is unavailable, the API returns a provider error and the client retains its Google Maps link.

Run `node backend/database/verify-catalog.js` to report the live published count, category distribution, coordinate coverage, source completeness, and state/territory coverage. It is read-only and exits non-zero if a published record has no source or a source lacks citation metadata. `node backend/database/enrich-coordinates.js --report-missing` prints a read-only missing-coordinate report; it does not infer or geocode coordinates.

For reviewed coordinate additions, prepare a JSON array with one candidate per
exact catalogue slug. Each candidate must include `heritage_slug`, matching
`state`, numeric `latitude`/`longitude`, `source_title`, `publisher`, HTTPS
`source_url`, `confidence` from 0.95 through 1, `review_status: "approved"`,
`reviewed_by`, and a valid ISO `reviewed_on` date. Review the report with
`node backend/database/enrich-coordinates.js path\to\candidates.json` first.
The explicit `--apply` mode rejects pending/unapproved candidates, ambiguous or
unmatched slugs, state mismatches, conflicting existing coordinates, unsafe
URLs, and low-confidence values. It runs on a local non-production database,
records review metadata, and never overwrites a different existing pair.

Historical description/timeline/architecture content should be cited to the source that supports it. Citation arrays currently identify supported content fields; avoid extending those claims based solely on the ASI list, which supplies title and locality, not detailed history.

## Production database checks

Before applying any schema to an existing production database, inspect its
`users` columns, primary/unique keys, duplicate emails, existing relation
shapes, ownership, permissions, constraints, and data. Test the schema and
seed against a disposable database on the target PostgreSQL major version,
then verify foreign-key/type compatibility (especially `users.id`) on
staging. Confirm backups and restore procedures, application role grants,
idempotent reruns, and representative API queries before production rollout.

Do not run `schema.sql` or `seed.sql` automatically at application startup.
Back up and positively identify the target before applying database changes.

## One-time initialization of a new Neon database

For a newly created, empty Neon database named exactly `heritageversedb`, use
the standalone initializer from the repository root. It uses the existing
`pg` dependency, does not load `backend/.env`, and is never invoked by backend
startup. Supply the direct Neon endpoint hostname copied from the intended
Neon project; pooler endpoints, localhost, other providers, other database
names, and host mismatches are rejected. TLS certificate verification remains
enabled.

Keep the URL out of command history and terminal output. In PowerShell, a
hidden prompt can set the dedicated process environment variable for this
single invocation:

```powershell
$secureUrl = Read-Host "Direct Neon connection URL" -AsSecureString
$urlPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUrl)
try {
  $env:HERITAGEVERSE_NEON_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($urlPointer)
  node backend/database/initialize-neon.js --expected-host "ep-example-endpoint.us-east-2.aws.neon.tech"
} finally {
  Remove-Item Env:HERITAGEVERSE_NEON_DATABASE_URL -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($urlPointer)
  $secureUrl.Dispose()
}
```

Replace the sample host with the exact direct endpoint hostname from Neon.
Before it asks for a write confirmation, the utility connects only to run
read-only checks for the exact database, the `public` schema, and the absence
of non-system relations. It then requires the exact confirmation
`INITIALIZE heritageversedb`. It sends each complete SQL file through
node-postgres in this fixed order: `schema.sql`, `seed.sql`, then migrations
`001` through `015`. Each file's own `BEGIN`/`COMMIT` and dollar-quoted blocks
are preserved; the utility does not split statements, run files concurrently,
retry, drop tables, truncate data, or reset sequences. Migration 013 has an
existing narrowly scoped `DELETE` of interim/out-of-scope
`heritage_catalog_membership` rows created by migration 009 so the final public
catalogue contains exactly the selected 30. The empty-database preflight ensures
those rows cannot be pre-existing user data; this migration behavior is called
out here because the initializer does not rewrite existing migration SQL.

If a file fails, the utility reports its filename and stops. Earlier files
may already have committed, so do not rerun the command: the non-empty
preflight will refuse a partial database. Do not drop, truncate, or reset it
to recover. Preserve the error output, inspect the reported file and database
state with a database operator, then use a separately provisioned empty Neon
database only after review if a clean initialization is still required. The
utility makes no automatic recovery changes. After all files succeed, it runs
read-only checks for the 30 published Maharashtra catalogue members, their
addresses, India country values, citation metadata, required schema columns,
and reports verified photograph counts separately from catalogue counts. It
does not create image records, verify images, or promote an account.

Implementation and automated tests must not execute this command against a
database. Review the script and this recovery procedure before any operator
invocation.
