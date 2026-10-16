# HeritageVerse

HeritageVerse is a React, TypeScript, and Vite frontend backed by an Express
REST API and PostgreSQL. Production deployment is intentionally not performed
by this repository's local setup instructions.

## Requirements

- Node.js 20.19 or later, or 22.12 or later
- npm
- PostgreSQL 15 or later (the schema uses standard PostgreSQL features)
- PostgreSQL `psql` command-line client for the documented SQL setup

## Local setup

1. Install frontend dependencies from the repository root:

   ```powershell
   npm.cmd --prefix frontend ci
   ```

2. Install backend dependencies:

   ```powershell
   npm.cmd --prefix backend ci
   ```

3. Copy `backend/.env.example` to `backend/.env` and set a local PostgreSQL
   `DATABASE_URL` and a private JWT secret. Copy `frontend/.env.example` to
   `frontend/.env.local` if the frontend should use a non-default API URL.

4. Positively identify the local development database and inspect its existing
   data before initialization. For the separate `psql` command-line client,
   set its standard `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER` variables
   to the same verified local database; `psql` prompts for the password unless
   you have configured a secure local password mechanism. From the repository
   root, apply the schema and then the optional development catalog:

   ```powershell
   psql -v ON_ERROR_STOP=1 -f backend/database/schema.sql
   psql -v ON_ERROR_STOP=1 -f backend/database/seed.sql
   ```

   `schema.sql` includes the `users.role` default and check constraint. Do not
   also apply `migrations/001_add_user_roles.sql` when applying the full schema.
   That standalone migration is for an existing database that needs only the
   role addition. Neither initialization nor seed scripts should be run
   automatically at application startup.

5. Start the API and frontend in separate terminals:

   ```powershell
   npm.cmd --prefix backend start
   npm.cmd run dev -- --host 127.0.0.1
   ```

   The API listens on port 5000 by default; the frontend listens on port 5173.
   `GET http://localhost:5000/` checks API startup and
   `GET http://localhost:5000/readyz` checks database readiness.

## Validation commands

```powershell
npm.cmd test
npm.cmd run test:migrations
npm.cmd run build
rg --files backend -g '*.js' -g '!node_modules/**' | ForEach-Object { node --check $_ }
```

There is no configured lint script. The API smoke test is restricted to an
explicitly isolated PostgreSQL database named `heritageverse_smoke_test` on a
loopback address and a loopback HTTP API running with `NODE_ENV=development` or
`NODE_ENV=test`; for that run, the API's `DATABASE_URL` must point to the same
dedicated database. Configure `HERITAGEVERSE_SMOKE_TARGET_TOKEN` with the same
local-only value of at least 32 characters in the API and smoke-test process,
and set `HERITAGEVERSE_SMOKE_DATABASE_URL` to that dedicated database in the
smoke-test process. The API reports its live database identity through a
token-protected local-only endpoint; the script compares it to the cleanup
connection before any mutation and again before cleanup. It never falls back
to `DATABASE_URL` and refuses production or remote targets. Provision the
isolated database with the required application schema and curated test data;
do not use a production database or production data copy. The smoke test
creates and removes two temporary ordinary accounts only after verification.
See
[backend/API.md](backend/API.md) for API contracts and
[backend/database/README.md](backend/database/README.md) for schema details and
database safety guidance.

## Production preparation

- Build the static frontend with `npm run build` and host `dist/` with SPA
  fallback to `index.html` for client-side routes.
- For Vercel, set the project Root Directory to the repository root, Install
  Command to `npm --prefix frontend ci`, Build Command to
  `npm --prefix frontend run build`, and Output Directory to `dist`. The
  separate frontend and backend lockfiles mean the frontend install command
  must use `frontend/package-lock.json`; there is no root lockfile.
- The root `vercel.json` proxies `/api/:path*` to the Render API and rewrites
  browser-history routes to `/index.html`. Production requests use the
  same-origin `/api` path, so Vercel Production and Preview do not need
  `VITE_API_BASE_URL`. Local development can still set that public variable to
  use a specific backend; never put secrets in `VITE_` variables.
- Local development can omit `VITE_API_BASE_URL`: Vite proxies same-origin
  `/api` requests to `http://127.0.0.1:5000`. The local value in
  `frontend/.env.example` is an alternative for direct local API requests.
- For Render, create a Node Web Service with root directory `backend`, build
  command `npm ci`, start command `npm start`, and HTTP health-check path
  `/readyz`. The service reads Render's `PORT`, binds to `0.0.0.0`, and does
  not run schema or seed files at startup. Configure `DATABASE_URL`,
  `JWT_SECRET`, and `CORS_ORIGIN` in Render's secret/environment settings;
  configure `TRUST_PROXY_HOPS` for the verified Render proxy path (the
  documented first-proxy setup uses one hop). Render's Node runtime sets the
  production runtime mode used by startup validation.
- Production and new local setups use only `DATABASE_URL` for application
  PostgreSQL connections. Existing local `DB_*` settings remain a
  loopback-only compatibility path when `DATABASE_URL` is absent; they are
  ignored when `DATABASE_URL` is present and cannot satisfy production startup.
  For Neon runtime traffic, use its pooled connection URL and retain verified
  TLS (prefer the connection URL's full certificate-verification mode); use a
  direct connection only for separately reviewed migration work. The pool has
  a 10-connection cap, a bounded connect timeout, and idle-client cleanup.
  Production rejects loopback database hosts and explicitly insecure TLS modes.
- `CORS_ORIGIN` is a comma-separated allowlist of exact HTTPS origins for
  direct cross-origin API clients; wildcard origins are rejected. The Vercel
  same-origin proxy does not require browser CORS access to Render. Dynamic
  preview domains need a fixed allowed origin or a separately reviewed CORS
  policy when they call Render directly.
- Heritage maps use Leaflet with OpenStreetMap tiles and attribution. A site is
  pinned only when it has a complete coordinate pair and a source reference
  explicitly supporting those coordinates; other records remain available in
  the list without approximate pins.
- Install API dependencies with `npm --prefix backend ci` and start with
  `npm --prefix backend start`.
- Production frontend builds use the `/api` proxy from `vercel.json`; local
  builds may set `VITE_API_BASE_URL` to a backend origin. Vite variables
  prefixed `VITE_` are public; never put secrets there.
- Maps default to `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. To use a
  different provider, set the public build-time `VITE_MAP_TILE_URL` together
  with `VITE_MAP_TILE_ATTRIBUTION`; optionally set
  `VITE_MAP_TILE_ATTRIBUTION_URL`. The URL must use HTTPS and include `{z}`,
  `{x}`, and `{y}`. Keep provider keys out of source control and use only keys
  intended for public browser use. OpenStreetMap's community tile service is
  best-effort; follow its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
  and use a contracted or self-hosted provider for sustained production use.
- Configure backend `DATABASE_URL`, `JWT_SECRET`, and exact frontend
  `CORS_ORIGIN` origins in the hosting platform's private environment/secret
  store. `PORT` is supplied by Render; set `TRUST_PROXY_HOPS` to the verified
  proxy count. Production startup fails if it is missing or zero. Do not trust
  forwarded client headers unless the network path ensures requests pass
  through those proxies.
- Authentication uses short-lived HS256 bearer JWTs (24 hours by default).
  The browser stores the token in `localStorage` and sends it in the
  `Authorization` header; cross-origin cookies are disabled, so cookie-based
  CSRF defenses are not part of this flow. Protect the frontend against XSS,
  use HTTPS, and rotate a strong private `JWT_SECRET` through the host's secret
  store. An account's current database status and role are checked on each
  authenticated request. Login and signup throttles are in-memory and
  process-local; put a shared rate limit at the edge before running multiple
  API instances.
- Use a managed PostgreSQL database with backups and TLS/network restrictions.
  Review and apply schema changes manually under the deployment process; do
  not run development seed data against production.
- Configure liveness checks to use `/health` and readiness checks to use
  `/readyz`; readiness runs `SELECT 1` and returns `503` when the database is
  unavailable.
- Apply database changes only after backup, review, and staging verification.

No production deployment or production database migration is performed here.

## Current local catalog and routing limits

The verified local database contains 2,190 published records: 25 UNESCO
cultural properties, two official museum records, and 2,163 complete rows
imported from the ASI protected-monuments list. The importer skipped
wrapped/incomplete rows rather than guessing at split fields. All records have
source references; imported ASI rows do not claim historical details, images,
visiting information, or coordinates absent from that list. Nine exact UNESCO
property points now have linked coordinate citations. These identify the
listed property, not necessarily an entrance; 2,181 records remain unpinned
until a coordinate source is recorded. The museum category has exactly the two
museum records.

The backend reads `ROUTING_BASE_URL` from `backend/.env` as the OSRM service's
base URL (origin only; do not append `/route/v1`). For a local OSRM service,
set the value to its private base URL, for example `ROUTING_BASE_URL=http://127.0.0.1:5001`,
then restart the backend. For a temporary connectivity check, the public demo
base is `ROUTING_BASE_URL=https://router.project-osrm.org`. OSRM's demo policy
limits it to reasonable non-commercial use at no more than one request per
second and gives no uptime, latency, or data update guarantees ([official demo
policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server)). The
backend paces upstream calls to one per second per process, but multiple API
instances need shared throttling to stay within a provider-wide limit.
HeritageVerse's commercial status is not specified, so the demo URL was not
persisted in `backend/.env`; use it only for eligible development checks. Use a
self-hosted or contracted service for production. The adapter requests OSRM's driving profile and returns
provider-supplied geometry, estimated duration, and turn steps in saved stop
order. Every stop needs a complete, source-verified coordinate pair. A live
adapter request between the verified Taj Mahal and Agra Fort records returned
3,760.8 m, an estimated 371.2 seconds, 107 geometry points, and turn steps. The
journey page keeps its external Google Maps directions link as a fallback.
Stop ordering is not optimized, and live traffic is not provided.

Heritage detail pages also offer a single-destination driving preview. The
browser requests current location only after a user asks for a route, or accepts
manually entered latitude/longitude. The route endpoint resolves the destination
from its published heritage record and requires the approved coordinate source
already stored for it. The chosen origin is sent to the backend routing service
for that request and is not saved by HeritageVerse. Route previews use the same
`ROUTING_BASE_URL` configuration and driving-only OSRM adapter as saved journeys.
Without a configured provider, the preview explains that it is unavailable and
Google Maps remains an external navigation option. HeritageVerse does not
provide live tracking, voice guidance, or automatic rerouting.

Then & Now now includes one verified, attributed Taj Mahal photo pair: a
1855–1865 riverbed photograph credited to Francis Frith and The J. Paul Getty
Museum, and a separate 2025 photograph by Dudva. Both source file pages list
CC0 1.0. The image notes identify their different viewpoints; the UI does not
claim that they are geometrically aligned. See
`backend/database/source-data/then-now-images.json` and
`node backend/database/import-media.js` for its repeatable, non-overwriting
import.

AI reconstruction now has a concrete OpenAI Image API edit provider as well as
the custom-provider contract. To enable OpenAI, set
`HERITAGE_RECONSTRUCTION_PROVIDER=openai` and `OPENAI_API_KEY` privately in
`backend/.env`; `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2.5-sunburst`.
The backend accepts only verified Wikimedia reference files, applies file
type/size limits, and returns a temporary generated PNG to the signed-in
requester. The catalogue never stores the result. OpenAI does not return an
item-specific license for this response, so the UI displays that rights
limitation. A real generation was not run because no provider key is configured
in this environment. A compatible custom provider can instead use
`HERITAGE_RECONSTRUCTION_URL` and `HERITAGE_RECONSTRUCTION_API_KEY`. Never put
provider keys in `VITE_` variables.

On 10 October 2026, a real Chrome session loaded OpenStreetMap tiles (HTTP 200,
`image/png`), showed OpenStreetMap attribution, and rendered the two verified
Living Atlas markers and an Agra Fort popup. The same browser loaded the Taj
Mahal Then & Now pair (HTTP 200, `image/jpeg`, 1280 px wide); the UI labels the
different viewpoints. Desktop and 390 px mobile layouts had no horizontal
overflow, JavaScript exceptions, or console errors. The app's initial
PowerShell network probes ran inside a sandbox that blocked outbound requests;
the real browser and the one-off OSRM adapter request ran outside that sandbox.
Evidence is in `qa-evidence-2026-10-10/`. After the admin integration and
hardening changes, the 11 October Chrome regression again loaded the atlas and
Taj Mahal media, checked the live API through Vite, and found no horizontal
overflow at 390 px, console errors, JavaScript exceptions, or failed HTTP
responses. Its screenshots and machine-readable results are in
`qa-evidence-2026-10-11/`; the current admin page remains inaccessible without
a verified administrator account.

The local backend still has no persistent OSRM provider configured. The public
demo returned a real route for one verification request, but its policy and
lack of availability guarantees make it unsuitable as an unqualified
production dependency. Set `ROUTING_BASE_URL` to a permitted self-hosted or
contracted OSRM-compatible service before enabling the authenticated journey
route workflow. A real AI image call still needs an OpenAI key (or a configured
compatible provider) and may require account verification/billing. Do not
promote an account until its owner is verified using the documented procedure.
AI answers, recognition, voice, translation, and personalized recommendations
remain unconfigured.
