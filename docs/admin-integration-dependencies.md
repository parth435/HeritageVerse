# HeritageVerse Admin Integration Dependencies & Ownership Roadmap

**Document Version:** 1.0.0  
**Status:** DRAFT / PROPOSED ARCHITECTURE  
**Target Repository:** [parth435/HeritageVerse](https://github.com/parth435/HeritageVerse.git)  

---

## 1. What Already Exists

### Frontend
* **`AdminApp.tsx`:** Complete UI layout, sidebar navigation, form controls, search/filtering logic, and data presentation.
* **`adminMockData.ts`:** Static structures representing sites, timeline events, users, and stories.
* **`AuthPage.tsx` & `AuthContext.tsx`:** Functional login/signup views wired to localStorage session management.
* **Interactive Experiences:** `ThenNow`, `LivingAtlas`, `MuseumInMotion`, `TimeMachine`, `MonumentDissection`, `TheJourney`, `HeritageOS` (fully operational frontend demonstrations owned by Swaranjali).

### Backend
* **`server/index.js`:** Express 5 application with CORS, JSON body parser, `GET /`, `GET /test-db`, `POST /api/auth/signup`, `POST /api/auth/signin`.
* **`server/db.js`:** PostgreSQL connection pool using `pg.Pool`.

### Database
* **`server/database/schema.sql`:** 13 normalized tables (`users`, `heritage_categories`, `heritage`, `heritage_sources`, `heritage_media`, `heritage_timeline_events`, `heritage_artifacts`, `heritage_architectural_layers`, `favorites`, `visited_places`, `reviews`, `journeys`, `journey_stops`).
* **`server/database/seed.sql`:** 25 Indian UNESCO World Heritage Sites with inscription events and sources.

---

## 2. What Parth (Backend Owner) Must Implement

1. **Port Configuration:**
   * Provide a fallback port in `server/index.js`: `const PORT = process.env.PORT || 5000;`.
2. **JWT Token Generation:**
   * Generate and return a signed JSON Web Token (`jwt.sign`) in `POST /api/auth/signin` and `POST /api/auth/signup`.
   * Include `{ id, email, role }` in token payload.
3. **Authentication & Authorization Middleware:**
   * `authenticateToken`: Validates incoming `Authorization: Bearer <token>` header.
   * `requireAdmin`: Rejects callers where `req.user.role !== 'admin'` with HTTP 403 Forbidden.
4. **Heritage CRUD Endpoints:**
   * `GET /api/heritage`: Select from `heritage` JOIN `heritage_categories` with parameterized query filters.
   * `POST /api/heritage`: Admin-protected site creation.
   * `PUT /api/heritage/:id`: Admin-protected site updates.
   * `DELETE /api/heritage/:id`: Admin-protected site deletion / archiving.
5. **Admin Statistics & Activity:**
   * `GET /api/admin/stats`: Aggregate count queries for sites, users, timeline events, and stories.
6. **Timeline & Media Routes:**
   * `GET/POST/PUT/DELETE /api/timeline` and `/api/media`.

---

## 3. What Vanashri (Database Owner) Must Implement

1. **User Role Column Migration:**
   * Apply additive migration to PostgreSQL:
     ```sql
     ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
     ```
   * Assign `'admin'` role to designated administrative seed/test accounts.
2. **Database Verification:**
   * Run and verify `server/database/schema.sql` and `server/database/seed.sql` on the live database.
3. **Stories Entity Decision:**
   * Clarify whether `stories` should be a dedicated table or if admin stories should be represented as extended narratives within `heritage` and `heritage_artifacts`.

---

## 4. What I (Admin / Integration Engineer) Will Implement

*(Upon explicit user approval in Phase 2)*

1. **Route Guard in `src/App.tsx`:**
   * Secure the `/admin` path: ensure user is authenticated AND `user.role === 'admin'`.
   * Redirect unauthorized visitors to `/` (login screen) or display an Access Denied banner.
2. **Admin UI API Integration in `src/components/admin/AdminApp.tsx`:**
   * Replace `useState(heritageSites)` with live data fetching via `src/services/adminApi.ts`.
   * Add loading spinners during network requests.
   * Add empty state display when no sites match filters.
   * Add error banner when API calls fail.
   * Implement deletion confirmation dialog and trigger `deleteHeritageSite(id)`.
3. **Admin User Profile & Logout Connection:**
   * Bind the sidebar user avatar to `useAuth().user` instead of hardcoded `"Aarav Mehta"`.
   * Wire the sidebar `<LogOut />` button to `useAuth().signOut()`.
4. **Integration Testing & QA:**
   * Execute end-to-end testing across Auth, Admin CRUD, and public experiences.
   * Verify zero regressions in Swaranjali's modules.
   * Audit responsive layouts across Desktop (1440px), Tablet (768px), and Mobile (390px).

---

## 5. What Requires Coordination

* **Admin Role & Auth Token Contract:**
  * Parth, Vanashri, and Integration Lead must agree on the exact token payload structure (`{ id: number, email: string, role: 'admin' | 'user' }`).
* **Heritage Field Mapping:**
  * Admin form fields (`name`, `location`, `state`, `category`, `era`, `status`, `description`) must map accurately to `heritage` table columns (`name`, `state`, `district`, `category_id`, `historical_period`, `publication_status`, `description`).
* **Category Slugs / Foreign Keys:**
  * Admin form category dropdown must match `heritage_categories` (`Fort`, `Cave`, `Temple`, `Archaeological site`).

---

## 6. Existing Files That Must Remain Untouched Until Explicit Approval

The following files must NOT be modified during preparation:
* [`src/App.tsx`](file:///c:/mini%20project/HeritageVerse/src/App.tsx)
* [`src/lib/auth.ts`](file:///c:/mini%20project/HeritageVerse/src/lib/auth.ts)
* [`src/context/AuthContext.tsx`](file:///c:/mini%20project/HeritageVerse/src/context/AuthContext.tsx)
* [`src/components/admin/AdminApp.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/admin/AdminApp.tsx)
* [`src/data/adminMockData.ts`](file:///c:/mini%20project/HeritageVerse/src/data/adminMockData.ts)
* [`src/data/monuments.ts`](file:///c:/mini%20project/HeritageVerse/src/data/monuments.ts)
* [`server/index.js`](file:///c:/mini%20project/HeritageVerse/server/index.js)
* [`server/db.js`](file:///c:/mini%20project/HeritageVerse/server/db.js)
* [`server/database/schema.sql`](file:///c:/mini%20project/HeritageVerse/server/database/schema.sql)
* [`src/components/ThenNow.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/ThenNow.tsx)
* [`src/components/CinematicMonument.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/CinematicMonument.tsx)
* [`src/components/LivingAtlas.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/LivingAtlas.tsx)
* [`src/components/MuseumInMotion.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/MuseumInMotion.tsx)
* [`src/components/TimeMachine.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/TimeMachine.tsx)
* [`src/components/MonumentDissection.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/MonumentDissection.tsx)
* [`src/components/TheJourney.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/TheJourney.tsx)
* [`src/components/HeritageOS.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/HeritageOS.tsx)

---

## 7. Exact Dependency Sequence

```
[Step 1: Database (Vanashri)]
  └── Add additive `role` column to `users` table in PostgreSQL.
  └── Verify seed data loaded into `heritage` and `heritage_categories`.
        ↓
[Step 2: Backend API & Auth (Parth)]
  └── Issue JWT token containing `role` in /api/auth/signin and /api/auth/signup.
  └── Implement `authenticateToken` and `requireAdmin` middleware.
  └── Mount /api/heritage REST CRUD endpoints connected to `server/db.js`.
        ↓
[Step 3: Frontend Route Guard & Auth Context (Me)]
  └── Update `src/App.tsx` to protect `/admin` route with role check.
  └── Update `src/lib/auth.ts` SessionUser interface to support `role`.
        ↓
[Step 4: Frontend Admin Integration (Me)]
  └── Import `src/services/adminApi.ts` into `src/components/admin/AdminApp.tsx`.
  └── Replace mock state with live backend queries and mutations.
  └── Implement loading states, empty states, error handling, and delete confirmation.
        ↓
[Step 5: Quality Assurance & Cross-Module Verification (Me)]
  └── End-to-end testing of Admin CRUD against live PostgreSQL.
  └── Regression testing across all 8 interactive public modules.
  └── Cross-device viewport testing (Desktop, Tablet, Mobile).
```
