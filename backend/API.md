# HeritageVerse API

Base URL: `http://localhost:5000`

Responses are JSON. Error responses use `{ "success": false, "message": "..." }` and do not include database or password details.

## Health checks

### `GET /`

Returns `{ "success": true, "message": "HeritageVerse Backend is running!" }`.

### `GET /health` and `GET /readyz`

`/health` is a liveness check and does not require the database. `/readyz` runs
`SELECT 1` and returns `503` if PostgreSQL is unavailable; use it as the
deployment readiness check.

### `GET /test-db`

Runs a database connectivity check. A connection failure returns `500` with a generic error message.

## Authentication

### `POST /api/auth/signup`

Send JSON with `name`, `email`, and `password`. Names must contain 2–120
characters, emails are normalized to lowercase and limited to 254 UTF-8 bytes,
and passwords require at least 8 characters and at most 72 UTF-8 bytes for
bcrypt. Sign-up and sign-in are each limited to 10 attempts per client IP per
15 minutes per server process; a throttled response is `429` with `Retry-After`.

Returns `201 Created` with `success`, `message`, a safe `user` object (`id`,
`name`, `email`, `role`, `status`, `created_at`), and a JWT `token`. Signup
always assigns the least-privileged `user` role. Missing or invalid fields
return `400`; a duplicate email returns `409`.

### `POST /api/auth/signin`

Send JSON with `email` and `password`.

Returns `200 OK` with `success`, `message`, a safe `user` object (`id`, `name`,
`email`, `role`, `status`), and a JWT `token`. Missing fields return `400`,
invalid credentials return `401`, and inactive accounts return `403`.

### `GET /api/auth/me`

Returns the authenticated user's `id`, `name`, `email`, `role`, `status`, and
`created_at` in a `user` object.

Send the JWT returned by signup or signin:

```http
Authorization: Bearer <token>
```

Missing, malformed, invalid, expired, or deleted-account tokens return `401`.
Suspended accounts return `403`. The current account role and status are read
from PostgreSQL for each authenticated request; JWT role claims do not grant
admin access.

JWTs use the configured `JWT_SECRET`, contain only the user ID as the `sub`
claim, use HS256, and default to a 24-hour expiration. `JWT_EXPIRES_IN` may
override the expiration duration. The frontend stores bearer tokens in browser
`localStorage` and sends them explicitly in the `Authorization` header;
cross-origin cookies are not enabled. Local storage is exposed to same-origin
script execution, so production must use HTTPS and protect the UI against XSS.

### `GET /api/users/me` and `PATCH /api/users/me`

Both routes require authentication. GET returns the safe current-user object.
PATCH accepts `{ "name": "Updated name" }` and changes only the name; email,
role, password hash, and other database fields are not accepted for update.

## Visited places and reviews

- `GET /api/visited` lists the current user's visited published places.
- `POST /api/visited` accepts `{ "heritage_id": <positive integer> }`; repeating
  the request is idempotent.
- `DELETE /api/visited/:heritageId` removes only the current user's visit.
- `GET /api/heritage/:heritageId/reviews` is public and returns `reviews` and a
  `summary` with count and average rating.
- `POST /api/heritage/:heritageId/reviews` requires authentication and accepts
  `rating` from 1 to 5 and an optional comment up to 2,000 characters. A user's
  next POST for the same heritage record updates their existing review.
- `PATCH /api/reviews/:reviewId` and `DELETE /api/reviews/:reviewId` require
  authentication and are restricted to the review owner or a database-verified
  administrator.

## Journeys

### `POST /api/routes`

Calculates a one-destination route preview. Send `{ "origin": { "latitude": 28.6, "longitude": 77.2 }, "heritage_id": 24, "mode": "driving" }`. The origin must be a valid coordinate pair. The backend resolves the destination from the published heritage record and requires coordinates backed by an approved source citation; the client cannot supply destination coordinates. When `ROUTING_BASE_URL` points to an OSRM-compatible service, the response includes its road geometry, distance, estimated duration, turn steps, and resolved destination coordinates. Only driving is supported by the configured adapter. The public endpoint limits clients to one request per second and 30 per minute, and paces the upstream provider to one request per second per server process. It does not save the origin; the origin is sent to the configured backend routing service for the requested route. The upstream pace is process local, so multiple API instances need a shared limiter if using a provider with a global request limit.

Missing destination coordinates return `422 ROUTE_DESTINATION_COORDINATES_MISSING`; unverified coordinates return `422 ROUTE_DESTINATION_COORDINATES_UNVERIFIED`; unavailable provider configuration returns `503 ROUTING_PROVIDER_NOT_CONFIGURED`; unreachable routes return a provider error. The frontend does not draw a route when the request fails.

All journey routes require authentication. `GET /api/journeys` lists only the
current user's journeys. `POST /api/journeys` accepts `name` and optional
`description`. `GET`, `PATCH`, and `DELETE /api/journeys/:journeyId` are scoped
to that same owner; PATCH accepts the journey name and description.

`POST /api/journeys/:journeyId/stops` accepts `heritage_id`, positive
`stop_order`, and optional `notes`. `GET /api/journeys/:journeyId` includes
stops ordered by `stop_order`. `DELETE /api/journeys/:journeyId/stops/:stopId` removes a stop only from an owned
journey. Unknown or foreign-owned journeys return `404`.

`GET /api/journeys/:journeyId/route?mode=driving` requires ownership of the
journey, at least two stops, and verified coordinates for every stop. It
preserves the saved stop order and supports up to 20 stops. When
`ROUTING_BASE_URL` points to a trusted OSRM-compatible service, the backend
returns provider route geometry, leg distance, estimated duration, and provider
turn steps. The provider call is server-side. The response explicitly marks
duration as estimated and live traffic as unavailable. Without the optional
provider URL, the endpoint returns `503 ROUTING_PROVIDER_NOT_CONFIGURED`; when
coordinates are missing it returns `422 ROUTE_COORDINATES_MISSING`. The client
offers Google Maps as an external navigation fallback. No route is fabricated
and stop ordering is not optimized automatically.

`ROUTING_BASE_URL` must be an origin only. Remote providers must use HTTPS;
plain HTTP is accepted only for localhost/loopback development services.
Paths, credentials, query strings, and fragments are rejected.

## Image comparison and reconstruction

`GET /api/heritage/:heritageId` includes media source page, creator, documented
date, license, license URL, comparison role, context, verification status, and
illustrative status. Image metadata also includes `thumbnail_url`, `provider`,
`wikimedia_filename`, and `match_confidence` when those values are recorded.
These fields are additive to the existing media contract. Public collection,
map, detail, and favorites responses include only verified, non-illustrative
image records; unverified acquisition candidates remain in admin review data.
The collection and favorites responses include the same metadata for their selected image. Then &
Now uses only verified, attributed historical and current images; undated
catalogue images are displayed separately and are not presented as historical.
It does not use illustrative output as an authentic photograph.

`node backend/database/import-wikimedia-images.js` is an operational CLI, not a
page-load task. It processes existing heritage IDs in batches and is dry-run by
default. Apply mode requires migration 006 and a local non-production database.
See `database/README.md` for the contact setting, review threshold, retry and
resume flags, and examples.

`GET /api/reconstruction/status` reports provider configuration without
returning credentials. `POST /api/heritage/:heritageId/reconstruction` requires
authentication, a verified and attributed historical image, and allows at most
three requests per account per 15 minutes per backend process. Without a
provider it returns `503`.

For the built-in OpenAI Image API edit provider, set
`HERITAGE_RECONSTRUCTION_PROVIDER=openai` and `OPENAI_API_KEY` in the backend's
private environment. `OPENAI_IMAGE_MODEL` defaults to
`gpt-image-2.5-sunburst`; the supported choices are `gpt-image-2.5-sunburst`
and `gpt-image-2.5-flare`. The backend downloads only HTTPS images served by
`thumb.wikimedia.org` or `upload.wikimedia.org`, verifies the file signature
against its image MIME type, and rejects source files larger than 8 MB. The
provider request has a 90-second timeout. Generated PNG output is returned as
a temporary `data:image/png` URL in the authenticated response; it is not
stored in the catalogue or on disk. The OpenAI response does not provide an
item-specific license, so the frontend displays a rights notice instead of
inventing one.

Alternatively, configure `HERITAGE_RECONSTRUCTION_URL` and
`HERITAGE_RECONSTRUCTION_API_KEY` for a compatible custom provider. The
endpoint must accept the JSON request from `backend/integrations/reconstruction.js` and
return an HTTPS `image_url`, `is_generated: true`, `license`, and HTTPS
`license_url`. All generated output is labeled illustrative and is never
presented as an authentic historical photograph. Provider calls may incur
charges; the API key must remain server-side.

## Administrator API

`GET /api/admin/dashboard`, `GET /api/admin/users`,
`GET /api/admin/users/:userId`, `PATCH /api/admin/users/:userId/role`,
`PATCH /api/admin/users/:userId/status`, `GET /api/admin/images`,
`GET /api/admin/heritage`,
`GET /api/admin/heritage/:heritageId`, `POST /api/admin/heritage`, and
`PATCH /api/admin/heritage/:heritageId` require an authenticated user whose
current `users.role` in PostgreSQL is `admin`. Client-supplied role values and
JWT role claims do not grant authorization. Heritage create/update accepts
the required content fields plus `category_id`, optional `district`, and
`publication_status` (`draft`, `published`, or `archived`). The optional
`latitude` and `longitude` fields must be supplied together and fall within
the geographic coordinate bounds. They should contain only coordinates
verified by a trusted source; absent coordinates on an update are preserved.
Adding or changing a coordinate pair also requires an HTTPS source reference
and administrator-supplied confidence of at least 0.95. An unchanged existing
pair can be retained without replacing its citation.
`POST` and `PATCH` also accept an optional `image` object to attach a
hosted image: `url`, `source_url`, `creator`, `alt_text`, `license`, and
`license_url` are required HTTPS/provenance fields; `thumbnail_url`, `caption`,
`credit`, and ISO `documented_date` are optional. The API stores the attachment
as a non-illustrative `gallery` image with `verification_status='unverified'`
and `provider='manual'`; it does not replace an existing image or mark the new
image verified. Duplicate URLs for the same place are ignored.
`DELETE /api/admin/heritage/:heritageId` archives the entry by changing its
publication status and preserves relationships and historical data.
`POST /api/admin/categories` and `PATCH /api/admin/categories/:categoryId` create and edit categories;
`DELETE /api/admin/categories/:categoryId` only removes an unused category and
returns `409` while any heritage entry still references it.

`GET /api/admin/users` accepts `q`, `role` (`user` or `admin`), `status`
(`ACTIVE` or `SUSPENDED`), `limit` (1–100, default 25), and `offset` (0–1,000,000).
It returns only account ID, name, email, role, status, and creation time.
`GET /api/admin/users/:userId` adds counts of the user's favorites, visits,
reviews, and journeys; neither endpoint returns password hashes or tokens.
`PATCH /api/admin/users/:userId/role` accepts `{ "role": "admin" }` to promote
an active registered account or `{ "role": "user" }` to demote an admin.
`PATCH /api/admin/users/:userId/status` accepts `{ "status": "SUSPENDED" }`
or `{ "status": "ACTIVE" }`. Both mutation endpoints validate account IDs
and values, write an `activity_logs` entry in the same transaction, and return
`409` for ineligible accounts, self-demotion/self-suspension, or attempts that
would remove the last active administrator. An administrator must first
reactivate a suspended account before promoting it.

## Favorites

All Favorites endpoints require a valid `Authorization: Bearer <token>` header. The authenticated user ID is taken only from the verified JWT.

### `GET /api/favorites`

Returns the authenticated user's saved published heritage records, newest first. Each item contains a `heritage` object compatible with the heritage collection response and a `created_at` timestamp for when it was saved.

```json
{ "success": true, "favorites": [] }
```

### `POST /api/favorites`

Send JSON with a positive numeric `heritage_id`. The target must be a published heritage record. The request is idempotent: repeated requests for the same user and heritage record do not create duplicate rows. A newly created favorite returns `201`; an existing favorite returns `200`.

### `DELETE /api/favorites/:heritageId`

Removes only the authenticated user's favorite for the positive numeric heritage ID. Repeating the request is safe and returns `200` with `removed: false` when no matching favorite exists.

## Public heritage API

### `GET /api/categories`

Returns categories represented by the published 30-place Maharashtra catalogue,
ordered by name and ID. Add `withVerifiedPhoto=true` to restrict categories to
those containing a published place with a verified, non-illustrative
`gallery` or `current` photograph:

```json
{ "success": true, "categories": [{ "id": 1, "name": "...", "slug": "..." }] }
```

### `GET /api/heritage-facets`

Returns the state/territory and district facets represented by published
catalogue members. The current state list is only `Maharashtra`. Add an exact
`state` query to return district options for that state. Facets come from the
full curated catalogue, not the current paginated result page. Add
`withVerifiedPhoto=true` to derive facets from published places with an
eligible verified, non-illustrative `gallery` or `current` photograph.

### `GET /api/heritage`

Returns only published records in `heritage_catalog_membership`. The current
curated membership contains 30 Maharashtra destinations. Optional query
parameters:

- `q`: case-insensitive search across name, description, history, and cultural significance
- `category`: exact category slug
- `state`: exact state value from the database
- `district`: exact district value from the database
- `hasTimeline`: `true` or `false` to filter records by whether sourced timeline events are present
- `withVerifiedPhoto`: `true` to include all published places with at least one verified, non-illustrative `gallery` or `current` photograph, including places outside the curated membership. Multiple photographs do not duplicate a place; one primary image is selected by display order.
- `limit`: integer from 1 to 100; defaults to 20
- `offset`: integer from 0 to 1,000,000; defaults to 0

Curated items are ordered by the catalogue's stable display order. In the
verified-photo scope, curated items are followed by outside-catalogue places
ordered by name and ID. Each curated item includes `country: "India"` alongside
its state and locality fields. Items also
contain heritage identity, a `category` object, coordinates with a
`coordinates_verified` flag, `image_url` for the first eligible image when
available, and a `media` array containing that selected image (or an empty
array). Public collection responses include only verified, non-illustrative
images. Pending and unverified candidates remain in admin review data and are
not returned as catalogue photographs. The optional `withVerifiedPhoto=true`
scope removes the curated-membership restriction while using the same image
eligibility rules.

```json
{
  "success": true,
  "items": [],
  "pagination": { "limit": 20, "offset": 0, "total": 0 }
}
```

Invalid or repeated text filters and invalid/out-of-range pagination values return `400`.

### `GET /api/heritage-map`

Returns published places with valid coordinates supported by an approved
coordinate citation. It accepts the same search and location filters as the
collection plus `limit` and `offset`. Add `withVerifiedPhoto=true` to use the
same verified-photo place scope as the collection. Places without approved
coordinate evidence remain available in Explore's list but do not get map
markers.

### `GET /api/heritage/:id`

Returns a published catalogue member by positive numeric database ID. A
published out-of-catalogue record is also public when it has an eligible
verified photograph; an authenticated user may additionally resolve a
published out-of-catalogue heritage record when an existing favorite or
visited-place relationship links it. The
`heritage` object includes its category and ordered arrays for media, timeline
events, artifacts, architectural layers, and sources.
Media includes verified, non-illustrative images. Pending image candidates do
not appear in this public response.

Malformed IDs return `400`; missing or unpublished records return `404`; unexpected database errors return `500`.

## CORS and production configuration

In development, the API allows the Vite origins `http://localhost:5173` and
`http://127.0.0.1:5173`. Set `CORS_ORIGIN` to a comma-separated list of exact
frontend origins when deploying. Production startup fails if `CORS_ORIGIN` or
`DATABASE_URL` is missing. Cross-origin credentials are not enabled; the
frontend sends JWTs in the `Authorization` header.

Production also requires exact HTTPS origins and a `JWT_SECRET` of at least 32 characters. Never use
the placeholder in `.env.example`. Configure `DATABASE_URL` in the runtime's
secret store. Production uses only that PostgreSQL connection URL and rejects
missing URLs, loopback hosts, and explicitly unverified or disabled TLS modes.
For backwards compatibility, local development may still use the existing
split `DB_*` settings only when they point to loopback; `DATABASE_URL` takes
precedence whenever supplied. `PORT` is read from the hosting environment, and
JSON request bodies are limited to 100 KB.

The sign-in/sign-up throttles are bounded but held in memory by each server
process. Use a shared edge or gateway rate limit before running multiple
instances. `TRUST_PROXY_HOPS` accepts an integer from 0 to 5 and defaults to 0;
set it to the verified number of trusted reverse proxies so client IP limits
use the real address. Production startup rejects zero because the Render web
service is behind a reverse proxy. Do not trust forwarded headers unless the
network path ensures requests pass through those proxies and clients cannot
spoof the trusted hop.
