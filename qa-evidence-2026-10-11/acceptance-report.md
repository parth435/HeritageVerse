# HeritageVerse acceptance report

**QA date:** 11 October 2026 (Asia/Kolkata). Browser JSON timestamps are UTC.

## Verdict

**PARTIALLY COMPLETE.** The local integration, catalogue, user workflows,
build, security checks, and browser regression pass. Production deployment,
live administrator CRUD, a configured routing provider, and a real AI generation
remain unverified because the necessary account or provider setup is absent.

## Git integration and preservation

- Working branch: `feature/integration`.
- Local integration commit: `940df4f3f6ecf142669ef60cbbae316b81904082`.
- `origin/main` is at `6d76de9d13039c97c01d56526e3d5dcee9e36eda`; it is an ancestor
  of the local branch and contains the admin PR merge and feature commit
  `35d9a33`.
- The merge conflicts were inspected file by file. The restored local backend
  authentication and catalogue routes were retained over the PR's demo server
  implementation; auth types, frontend routes, schema, and admin APIs were
  reconciled with the existing work.
- The stash's overlapping versions of `server/database/schema.sql`,
  `server/store.js`, `server/test-suite.js`, `src/App.tsx`, `src/lib/auth.ts`,
  and `src/services/adminApi.ts` were reviewed before restoring their local
  work; conflict resolution did not blindly select one side for whole files.
- The pre-existing staged, unstaged, and untracked work remains in the working
  tree. Both safety stashes remain. No reset, clean, stash drop, or push was
  performed. The integration merge commit is committed; the other working-tree
  changes remain uncommitted.

## Verification results

| Check | Result |
|---|---|
| `npm.cmd test` | 41 passed, 0 failed. Includes auth/session status, admin RBAC and CRUD logic, user-data isolation, rate limiting, routing, reconstruction, trusted-proxy configuration, and catalog validation. |
| `npm.cmd run build` | Passed; TypeScript and Vite production build completed. |
| Server syntax check | `node --check` passed for 38 server JavaScript files. |
| `npm.cmd run test:migrations` | Passed. Applied schema, migrations 001–005, and seed in a temporary transaction; 27 heritage rows, 27 sources, 0 users, 0 admins; rolled back. |
| `node server/database/verify-catalog.js` | 2,190 published records; 2,199 provenance records; 9 verified coordinate pairs; no incomplete coordinate pairs, missing sources, or incomplete source metadata; 32 states/territories. |
| `npm.cmd audit` | 0 known vulnerabilities. |
| `npm.cmd --prefix server audit` | 0 known vulnerabilities. |
| `node server/integration-smoke.js` | 86 live API checks passed. It created and then removed two temporary ordinary accounts. |
| `node qa-evidence-2026-10-11/browser-check.cjs` | Passed in headless Chrome. 26 OpenStreetMap tiles and both Then & Now images returned HTTP 200; two atlas markers rendered; no console errors, exceptions, failed HTTP responses, or horizontal overflow at desktop and 390 px mobile widths. |

Evidence screenshots: `home-desktop.png`, `home-mobile.png`,
`explore-mobile.png`, and `taj-mahal-detail-desktop.png`. Machine-readable
browser results are in `browser-check.json`.

The live API smoke exercised catalogue search/filter/detail and citations,
signup/signin/profile, favorites, visited places, reviews, journey ownership
and stops, authorization, and unavailable-provider responses. Its route test
confirmed the verified-coordinate journey is accepted and returns the explicit
unconfigured-provider response. The browser loaded the app through Vite's real
`/api` proxy.

## Database safety note

During development of the migration smoke harness, an early attempt failed to
strip a transaction marker placed after leading SQL comments. Two early probes
therefore applied the additive/idempotent schema and seed to the local database
and left two generated scratch schemas. No rows were deleted. I removed only
those exact generated schemas after verifying their names, then reran the
catalog check. The corrected harness now applies all scripts in a temporary
schema inside a transaction and rolls it back. Current checks show 14 ordinary
users, 0 administrators, and 0 remaining migration-smoke schemas; the published
catalog remains at 2,190 records.

## Security and operational hardening

- Removed the hardcoded administrator insert and role-promotion upsert from the
  seed, and removed the stale fictional administrator from unused mock data.
  No `.env` file is tracked by Git; targeted scans found no remaining seeded
  admin credential pattern.
- Bearer authentication verifies the account still exists and is active, then
  reads its current role from PostgreSQL. Deleted and suspended accounts cannot
  continue using an old token. Signup cannot set a role.
- Added bounded sign-in/sign-up throttles, input and bcrypt byte limits,
  exact HTTPS production CORS validation, a database-aware `/readyz` check, and
  validated `TRUST_PROXY_HOPS` configuration for deployments behind a proxy.
- Replaced the vulnerable `nodemon` development dependency with Node's built-in
  `--watch`; patched compatible root and server dependency ranges. Both npm
  audits are clean.
- Browser tokens remain in `localStorage`; protect the app from XSS and serve
  it over HTTPS. Rate limits are per-process and in memory, so a multi-instance
  deployment needs shared edge/gateway throttling. No external penetration
  test was run.

## Remaining work and blockers

- **Admin portal:** the local database has no administrator account. Anonymous
  admin requests return 401 and an ordinary account receives 403; automated
  admin authorization and CRUD tests pass. Live admin sign-in, UI CRUD, and
  admin responsive checks require an independently verified administrator.
  The documented provisioning command requires a confirmed existing user; no
  account was promoted for this test.
- **Routing:** `ROUTING_BASE_URL` is not configured. The adapter tests pass and
  the API reports its explicit 503 fallback; an authenticated app-level route
  with provider geometry was not verified in this final run. Configure a
  self-hosted or contracted OSRM-compatible service for production. The public
  demo remains subject to its usage limits and availability policy.
- **AI reconstruction:** provider status reports unconfigured. Mocked provider
  success and failure tests pass, but no live image generation was attempted
  without server-side provider credentials.
- **Deployment:** no production host or database was provisioned or changed.
  Configure private database/JWT/CORS settings, HTTPS, backups, monitoring,
  shared rate limiting, and contracted map tiles; apply migrations only through
  the reviewed deployment process. OpenStreetMap tiles loaded in QA but remain
  a best-effort community service.

See `README.md`, `server/API.md`, and `server/database/README.md` for setup,
API behavior, provisioning, and production requirements. Earlier evidence under
`qa-evidence-2026-10-10/` was preserved.
