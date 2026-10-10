# HERITAGEVERSE — ADMIN IMPLEMENTATION CONTRACT & DEPENDENCY LOCK

**Document Version:** 1.0.0  
**Status:** FROZEN CONTRACT / PREPARATION ONLY  
**Repository:** [parth435/HeritageVerse](https://github.com/parth435/HeritageVerse.git)  
**Branch:** `feature/integration-admin`  
**Phase:** Phase 4 — Implementation Contract & Dependency Lock  

---

## 1. PHASE 3 FACTS BASELINE

The following architectural facts from the Phase 3 Audit are established:
1. **Existing Backend Endpoints:**
   * `GET /` — Health check
   * `GET /test-db` — PostgreSQL connection check
   * `POST /api/auth/signup` — User registration with bcrypt hashing
   * `POST /api/auth/signin` — User login verifying bcrypt hash
2. **Current Admin State:**
   * **Zero** Admin API routes currently exist in the backend.
   * Admin authorization is **not currently implemented** on the backend.
   * The `/admin` frontend route in `src/App.tsx` is completely unguarded.
3. **Current Database State:**
   * The `users` table currently contains only: `id`, `name`, `email`, `password_hash`, `created_at`.
   * There is **no confirmed role or status implementation** in the database.
4. **Planned Admin Functional Areas:**
   * Dashboard statistics
   * Admin activity
   * Heritage Sites CRUD
   * Timeline Events CRUD
   * Stories CRUD
   * Admin Users
   * User Status Update
   * User Role Update
   * Media References

---

## 2. PART A — PARTH BACKEND CONTRACT

A precise implementation specification for backend architecture and security owned by **Parth**.

### 2.1 Authentication & Token Strategy
* **Token Standard:** JSON Web Token (JWT) signed using the existing `jsonwebtoken` dependency declared in `server/package.json`.
* **JWT Secret:** Must be retrieved from environment variable `process.env.JWT_SECRET`. No hardcoded secrets.
* **Token Expiration:** Recommended 24 hours (`expiresIn: "24h"`).
* **JWT Payload:** Must be constructed strictly from existing database columns:
  ```json
  {
    "id": 1,
    "email": "user@example.com",
    "role": "admin"
  }
  ```
  *(Note: `id` and `email` come from the verified `users` row; `role` will come from the proposed `users.role` column once applied by Vanashri).*

### 2.2 HTTP Authorization Header Format
* Standard Bearer token scheme:
  ```http
  Authorization: Bearer <token>
  ```

### 2.3 Authentication Middleware (`authenticateToken`)
* **Behavior:**
  1. Extract `Authorization` header.
  2. If header is missing or does not start with `Bearer `, reject immediately with HTTP 401 Unauthorized.
  3. Verify token with `jwt.verify(token, process.env.JWT_SECRET)`.
  4. If verification fails (expired, altered, invalid signature), reject with HTTP 401 Unauthorized.
  5. If valid, attach decoded payload to `req.user` and call `next()`.

### 2.4 Admin Authorization Middleware (`requireAdmin`)
* **Behavior:**
  1. Executes strictly **after** `authenticateToken`.
  2. Inspects `req.user`.
  3. If `!req.user || req.user.role !== 'admin'`, reject immediately with HTTP 403 Forbidden.
  4. If `req.user.role === 'admin'`, call `next()`.

### 2.5 Standardized Error Responses
* **Unauthorized Response (HTTP 401):**
  ```json
  {
    "success": false,
    "message": "Authentication required. Please sign in."
  }
  ```
* **Forbidden Response (HTTP 403):**
  ```json
  {
    "success": false,
    "message": "Access denied. Administrator privileges required."
  }
  ```
* **Validation Error Response (HTTP 400):**
  ```json
  {
    "success": false,
    "message": "Invalid input data",
    "errors": { "field": ["Error description"] }
  }
  ```
* **Resource Not Found Response (HTTP 404):**
  ```json
  {
    "success": false,
    "message": "Requested resource was not found"
  }
  ```
* **Internal Server Error Response (HTTP 500):**
  ```json
  {
    "success": false,
    "message": "An internal server error occurred"
  }
  ```

### 2.6 Server Port Fallback
* In `server/index.js`, replace `app.listen(process.env.PORT)` with:
  ```javascript
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  ```

---

## 3. PART B — VANASHRI DATABASE CONTRACT

A precise database specification for **Vanashri**, defining the minimum schema required to support Admin functionality without guessing or inventing unconfirmed fields.

### 3.1 Table: `users` (Additive Migration)
* **Status:** Existing in `schema.sql`; requires additive columns.
* **Columns:**
  * `id`: `SERIAL PRIMARY KEY` (Existing)
  * `name`: `TEXT NOT NULL` (Existing)
  * `email`: `TEXT NOT NULL UNIQUE` (Existing)
  * `password_hash`: `TEXT NOT NULL` (Existing)
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()` (Existing)
  * `role`: `TEXT NOT NULL DEFAULT 'user'` (Proposed Additive Column: values `'user'`, `'admin'`)
  * `status`: `TEXT NOT NULL DEFAULT 'ACTIVE'` (Proposed Additive Column: values `'ACTIVE'`, `'SUSPENDED'`)
* **Purpose:** Distinguish admin users from general visitors; manage account suspension.

### 3.2 Table: `heritage` / `heritage_sites`
* **Status:** Fully defined in existing `schema.sql` as table `heritage`.
* **Columns Required by Admin UI:**
  * `id`: `SERIAL PRIMARY KEY`
  * `name`: `TEXT NOT NULL`
  * `slug`: `TEXT NOT NULL UNIQUE` (Derived from name)
  * `description`: `TEXT NOT NULL`
  * `history`: `TEXT NOT NULL DEFAULT ''`
  * `cultural_significance`: `TEXT NOT NULL DEFAULT ''`
  * `architecture`: `TEXT NOT NULL DEFAULT ''`
  * `historical_period`: `TEXT NOT NULL` (Maps to UI `era`)
  * `category_id`: `INTEGER NOT NULL REFERENCES heritage_categories(id)`
  * `state`: `TEXT NOT NULL`
  * `district`: `TEXT` (Maps to UI `location`)
  * `latitude`: `NUMERIC(9,6)` (Nullable)
  * `longitude`: `NUMERIC(9,6)` (Nullable)
  * `publication_status`: `TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('draft', 'published', 'archived'))`
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* **Purpose:** Core monument inventory displayed and managed in Admin Heritage tab.

### 3.3 Table: `heritage_timeline_events`
* **Status:** Fully defined in existing `schema.sql`.
* **Columns Required by Admin UI:**
  * `id`: `SERIAL PRIMARY KEY`
  * `heritage_id`: `INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE`
  * `title`: `TEXT NOT NULL` (Maps to UI `event`)
  * `description`: `TEXT NOT NULL`
  * `event_period`: `TEXT NOT NULL` (Maps to UI `year`)
  * `event_date`: `DATE` (Nullable)
  * `display_order`: `INTEGER NOT NULL DEFAULT 0`
  * `source_id`: `INTEGER REFERENCES heritage_sources(id) ON DELETE SET NULL`
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  * `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* **UI Status Column:** `PENDING TEAM DECISION` (Whether `publication_status` should be added to timeline events).

### 3.4 Table: `stories`
* **Status:** Missing in current `schema.sql`.
* **Proposed Minimum Schema:**
  * `id`: `SERIAL PRIMARY KEY`
  * `title`: `TEXT NOT NULL`
  * `category`: `TEXT NOT NULL`
  * `author`: `TEXT NOT NULL`
  * `content`: `TEXT` `PENDING TEAM DECISION`
  * `publication_status`: `TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'published', 'archived'))`
  * `published_at`: `TIMESTAMPTZ` (Nullable)
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* **Purpose:** Support the Stories tab in AdminApp.

### 3.5 Table: `heritage_media`
* **Status:** Fully defined in existing `schema.sql`.
* **Columns Required by Admin UI:**
  * `id`: `SERIAL PRIMARY KEY`
  * `heritage_id`: `INTEGER NOT NULL REFERENCES heritage(id) ON DELETE CASCADE`
  * `media_type`: `TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio', 'document'))`
  * `url`: `TEXT NOT NULL`
  * `caption`: `TEXT`
  * `alt_text`: `TEXT`
  * `credit`: `TEXT`
  * `license`: `TEXT`
  * `display_order`: `INTEGER NOT NULL DEFAULT 0`
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* **Purpose:** Support Media Library tab in AdminApp.

### 3.6 Table: `activity_logs`
* **Status:** Missing in current `schema.sql`.
* **Proposed Minimum Schema:**
  * `id`: `SERIAL PRIMARY KEY`
  * `title`: `TEXT NOT NULL` (e.g., "Panhala Fort added")
  * `entity_type`: `TEXT NOT NULL` ('Heritage Site', 'Content', 'User', 'System')
  * `entity_id`: `INTEGER` (Nullable)
  * `user_id`: `INTEGER REFERENCES users(id) ON DELETE SET NULL`
  * `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* **Purpose:** Support Recent Activity feed on Admin Dashboard.

---

## 4. PART C — API CONTRACT (EXACTLY 20 ENDPOINTS)

The planned Admin API consists of **exactly 20 endpoints** under the `/api/admin` namespace.

```
+-------------------------------------------------------------------------------------------------------------+
|                                    TOTAL PLANNED ADMIN ENDPOINTS: 20                                        |
+----+--------+------------------------------------+--------------------------+-------------------------------+
| #  | Method | Path                               | Functional Area          | Access Rule                   |
+----+--------+------------------------------------+--------------------------+-------------------------------+
| 1  | GET    | /api/admin/stats                   | Dashboard                | Admin Token Required          |
| 2  | GET    | /api/admin/activity                | Dashboard                | Admin Token Required          |
| 3  | GET    | /api/admin/sites                   | Heritage Sites           | Admin Token Required          |
| 4  | POST   | /api/admin/sites                   | Heritage Sites           | Admin Token Required          |
| 5  | PUT    | /api/admin/sites/:id               | Heritage Sites           | Admin Token Required          |
| 6  | DELETE | /api/admin/sites/:id               | Heritage Sites           | Admin Token Required          |
| 7  | GET    | /api/admin/timeline                | Timeline Events          | Admin Token Required          |
| 8  | POST   | /api/admin/timeline                | Timeline Events          | Admin Token Required          |
| 9  | PUT    | /api/admin/timeline/:id            | Timeline Events          | Admin Token Required          |
| 10 | DELETE | /api/admin/timeline/:id            | Timeline Events          | Admin Token Required          |
| 11 | GET    | /api/admin/stories                 | Stories / Content        | Admin Token Required          |
| 12 | POST   | /api/admin/stories                 | Stories / Content        | Admin Token Required          |
| 13 | PUT    | /api/admin/stories/:id             | Stories / Content        | Admin Token Required          |
| 14 | DELETE | /api/admin/stories/:id             | Stories / Content        | Admin Token Required          |
| 15 | GET    | /api/admin/users                   | User Management          | Admin Token Required          |
| 16 | PATCH  | /api/admin/users/:id/status        | User Management          | Admin Token Required          |
| 17 | PATCH  | /api/admin/users/:id/role          | User Management          | Admin Token Required          |
| 18 | GET    | /api/admin/media                   | Media Library            | Admin Token Required          |
| 19 | POST   | /api/admin/media                   | Media Library            | Admin Token Required          |
| 20 | DELETE | /api/admin/media/:id               | Media Library            | Admin Token Required          |
+----+--------+------------------------------------+--------------------------+-------------------------------+
```

### Detailed Endpoint Specifications

#### 1. `GET /api/admin/stats`
* **Purpose:** Return aggregate metric cards for Dashboard.
* **Authentication:** Required (`Bearer <token>`)
* **Authorization:** Required (`role === 'admin'`)
* **Request Body:** None
* **Success (200):** `{ success: true, data: { heritageSitesCount: 25, registeredUsersCount: 140, timelineEventsCount: 86, publishedStoriesCount: 18 } }`
* **Errors:** 401 Unauthorized, 403 Forbidden, 500 Server Error
* **Database Dependency:** `COUNT(*)` queries on `heritage`, `users`, `heritage_timeline_events`, `stories`.

#### 2. `GET /api/admin/activity`
* **Purpose:** Return recent platform activity log.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, data: [ { id: "1", title: "Panhala Fort added", type: "Heritage Site", timeAgo: "2 hours ago" } ] }`
* **Errors:** 401, 403, 500
* **Database Dependency:** `activity_logs` table.

#### 3. `GET /api/admin/sites`
* **Purpose:** List heritage sites for table view with search and filters.
* **Query Parameters:** `search`, `state`, `status`
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, data: [ { id: "1", name: "Panhala Fort", location: "Kolhapur, Maharashtra", state: "Maharashtra", category: "Fort", era: "17th Century", status: "PUBLISHED", updatedAt: "2 hours ago", image: "..." } ] }`
* **Errors:** 401, 403, 500
* **Database Dependency:** `heritage` JOIN `heritage_categories`.

#### 4. `POST /api/admin/sites`
* **Purpose:** Create a new heritage site.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** `{ name: string, location: string, state: string, category: string, era: string, status: string, description?: string, image?: string }`
* **Success (201):** `{ success: true, message: "Site created successfully", data: { id: "26", name: "..." } }`
* **Errors:** 400 Bad Request, 401, 403, 500
* **Database Dependency:** `heritage` table INSERT.

#### 5. `PUT /api/admin/sites/:id`
* **Purpose:** Update existing heritage site details.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** Partial site fields.
* **Success (200):** `{ success: true, message: "Site updated successfully", data: { id: "...", updatedAt: "Just now" } }`
* **Errors:** 400, 401, 403, 404, 500
* **Database Dependency:** `heritage` table UPDATE.

#### 6. `DELETE /api/admin/sites/:id`
* **Purpose:** Delete a heritage site.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, message: "Site deleted successfully", data: { id: "..." } }`
* **Errors:** 401, 403, 404, 500
* **Database Dependency:** `heritage` table DELETE (cascades).

#### 7. `GET /api/admin/timeline`
* **Purpose:** List timeline events.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, data: [ { id: "1", year: "1666", event: "Shivaji escapes Panhala", description: "...", site: "Panhala Fort", status: "PUBLISHED" } ] }`
* **Errors:** 401, 403, 500
* **Database Dependency:** `heritage_timeline_events` JOIN `heritage`.

#### 8. `POST /api/admin/timeline`
* **Purpose:** Create a historical timeline event.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** `{ year: string, event: string, description: string, siteId: number, status: string }`
* **Success (201):** `{ success: true, message: "Timeline event created", data: { id: "..." } }`
* **Errors:** 400, 401, 403, 500
* **Database Dependency:** `heritage_timeline_events` INSERT.

#### 9. `PUT /api/admin/timeline/:id`
* **Purpose:** Update timeline event.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** Partial timeline fields.
* **Success (200):** `{ success: true, message: "Timeline event updated", data: { id: "..." } }`
* **Errors:** 400, 401, 403, 404, 500
* **Database Dependency:** `heritage_timeline_events` UPDATE.

#### 10. `DELETE /api/admin/timeline/:id`
* **Purpose:** Delete timeline event.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, message: "Timeline event deleted", data: { id: "..." } }`
* **Errors:** 401, 403, 404, 500
* **Database Dependency:** `heritage_timeline_events` DELETE.

#### 11. `GET /api/admin/stories`
* **Purpose:** List editorial stories.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, data: [ { id: "1", title: "...", category: "...", author: "...", status: "PUBLISHED", published: "..." } ] }`
* **Errors:** 401, 403, 500
* **Database Dependency:** `stories` table.

#### 12. `POST /api/admin/stories`
* **Purpose:** Create editorial story.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** `{ title: string, category: string, author: string, status: string }`
* **Success (201):** `{ success: true, message: "Story created", data: { id: "..." } }`
* **Errors:** 400, 401, 403, 500
* **Database Dependency:** `stories` INSERT.

#### 13. `PUT /api/admin/stories/:id`
* **Purpose:** Update editorial story.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** Partial story fields.
* **Success (200):** `{ success: true, message: "Story updated", data: { id: "..." } }`
* **Errors:** 400, 401, 403, 404, 500
* **Database Dependency:** `stories` UPDATE.

#### 14. `DELETE /api/admin/stories/:id`
* **Purpose:** Delete editorial story.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, message: "Story deleted", data: { id: "..." } }`
* **Errors:** 401, 403, 404, 500
* **Database Dependency:** `stories` DELETE.

#### 15. `GET /api/admin/users`
* **Purpose:** List registered users with roles and statuses.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, data: [ { id: "1", name: "Aarav Mehta", email: "aarav@...", role: "ADMIN", status: "ACTIVE", joined: "Jan 12, 2025" } ] }`
* **Errors:** 401, 403, 500
* **Database Dependency:** `users` SELECT (`id`, `name`, `email`, `role`, `status`, `created_at`).

#### 16. `PATCH /api/admin/users/:id/status`
* **Purpose:** Update user status (e.g., ACTIVE, SUSPENDED).
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** `{ status: "ACTIVE" | "SUSPENDED" }`
* **Success (200):** `{ success: true, message: "User status updated", data: { id: "...", status: "..." } }`
* **Errors:** 400, 401, 403, 404, 500
* **Database Dependency:** `users` UPDATE `status`.

#### 17. `PATCH /api/admin/users/:id/role`
* **Purpose:** Update user role (e.g., USER, ADMIN).
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** `{ role: "USER" | "ADMIN" }`
* **Success (200):** `{ success: true, message: "User role updated", data: { id: "...", role: "..." } }`
* **Errors:** 400, 401, 403, 404, 500
* **Database Dependency:** `users` UPDATE `role`.

#### 18. `GET /api/admin/media`
* **Purpose:** List media items.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, data: [ { id: "1", siteId: "1", siteName: "Panhala Fort", imageUrl: "...", status: "PUBLISHED", uploadedAt: "..." } ] }`
* **Errors:** 401, 403, 500
* **Database Dependency:** `heritage_media` JOIN `heritage`.

#### 19. `POST /api/admin/media`
* **Purpose:** Add new media reference.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** `{ siteId: number, imageUrl: string, caption?: string, mediaType?: string }`
* **Success (201):** `{ success: true, message: "Media added", data: { id: "..." } }`
* **Errors:** 400, 401, 403, 500
* **Database Dependency:** `heritage_media` INSERT.

#### 20. `DELETE /api/admin/media/:id`
* **Purpose:** Delete media item.
* **Authentication:** Required | **Authorization:** Required
* **Request Body:** None
* **Success (200):** `{ success: true, message: "Media deleted", data: { id: "..." } }`
* **Errors:** 401, 403, 404, 500
* **Database Dependency:** `heritage_media` DELETE.

---

## 5. PART D — FRONTEND DEPENDENCY CONTRACT

Strict separation of frontend modifications into **REQUIRED AFTER BACKEND READY** versus **NOT REQUIRED**.

### 5.1 REQUIRED AFTER BACKEND READY (Only in Phase 5+)
1. **`src/App.tsx`:**
   * Add authorization guard to `/admin`: verify `user && user.role === 'admin'`.
   * Redirect non-admin authenticated users and unauthenticated guests.
2. **`src/lib/auth.ts`:**
   * Extend `SessionUser` interface with `role?: string; token?: string;`.
   * Store token returned by `POST /api/auth/signin` into session storage/local storage.
3. **`src/context/AuthContext.tsx`:**
   * Pass role and token state to consuming components.
4. **`src/components/admin/AdminApp.tsx`:**
   * Import functions from `src/services/adminApi.ts`.
   * Replace static mock data with `useEffect` data fetching.
   * Add loading state spinners, empty state messages, error banners.
   * Add Delete confirmation dialog.
   * Bind sidebar profile to active authenticated user and wire logout button.
5. **`src/services/adminApi.ts`:**
   * Update endpoint paths to match `/api/admin/*` contract (e.g. `/api/admin/sites`).

### 5.2 NOT REQUIRED (Must Remain Untouched)
* **DO NOT MODIFY:** `src/data/adminMockData.ts` (Keep for fallback/testing).
* **DO NOT MODIFY:** `src/data/monuments.ts` (Used by public experiences).
* **DO NOT MODIFY:** `src/components/ThenNow.tsx` (Owned by Swaranjali).
* **DO NOT MODIFY:** Any interactive component: `CinematicMonument.tsx`, `LivingAtlas.tsx`, `MuseumInMotion.tsx`, `TimeMachine.tsx`, `MonumentDissection.tsx`, `TheJourney.tsx`, `HeritageOS.tsx`.

---

## 6. PART E — RESPONSIBILITY MATRIX

```
+------------------+--------------------------------------------------------------------------+
| Owner            | Locked Responsibilities                                                  |
+------------------+--------------------------------------------------------------------------+
| PARTH            | 1. Port fallback (PORT || 5000) in server/index.js                       |
| (Backend Lead)   | 2. JWT token generation in signup & signin                               |
|                  | 3. authenticateToken and requireAdmin middleware                         |
|                  | 4. All 20 /api/admin/* endpoints, controllers, and queries              |
|                  | 5. Server-side validation and HTTP error response formatting             |
+------------------+--------------------------------------------------------------------------+
| VANASHRI         | 1. Additive column migration: users.role and users.status                |
| (Database Lead)  | 2. PostgreSQL seed execution & verification (schema.sql & seed.sql)     |
|                  | 3. Create stories table & activity_logs table if approved                |
|                  | 4. Provide active database credentials to backend                        |
+------------------+--------------------------------------------------------------------------+
| MY ROLE          | 1. Phase 4 Contract Locking (Complete)                                   |
| (Admin & QA Lead)| 2. Frontend route guard in App.tsx (after Parth completes auth)          |
|                  | 3. AdminApp.tsx API integration & UI CRUD states (after Parth endpoints) |
|                  | 4. End-to-end integration testing                                        |
|                  | 5. Regression testing of Swaranjali's modules                            |
|                  | 6. Cross-viewport responsive QA (Desktop, Tablet, Mobile)                |
+------------------+--------------------------------------------------------------------------+
```

---

## 7. PART F — IMPLEMENTATION ORDER & BLOCKER CHAIN

```
[STEP 1: Schema Confirmation]
  └── Action: Vanashri reviews and finalizes table schemas for users, stories, activity_logs.
  └── Blocker for: Step 2.

[STEP 2: Database Migration & Verification]
  └── Action: Vanashri applies `ALTER TABLE users ADD COLUMN IF NOT EXISTS role ...` and verifies seed data.
  └── Blocker for: Step 3 and Step 4.

[STEP 3: Backend Authentication & Authorization]
  └── Action: Parth implements JWT generation, `authenticateToken`, and `requireAdmin` middleware.
  └── Blocker for: Step 4.

[STEP 4: Admin API Endpoints]
  └── Action: Parth implements the 20 `/api/admin/*` endpoints in Express.
  └── Blocker for: Step 5 and Step 7.

[STEP 5: Backend Endpoint Testing]
  └── Action: Verify all 20 endpoints via curl/Postman against live PostgreSQL.
  └── Blocker for: Step 6.

[STEP 6: Initial Admin Account Verification]
  └── Action: Ensure at least one user with `role = 'admin'` exists and receives admin JWT.
  └── Blocker for: Step 7.

[STEP 7: Frontend Admin Integration]
  └── Action: (Me) Connect `AdminApp.tsx` and `App.tsx` route guard to live backend APIs.
  └── Blocker for: Step 8.

[STEP 8: End-to-End Integration Testing]
  └── Action: (Me) Verify complete CRUD cycles from React Admin UI to PostgreSQL.
  └── Blocker for: Step 9.

[STEP 9: Cross-Module Regression Testing]
  └── Action: (Me) Verify zero regressions across Swaranjali's 8 public interactive modules.
  └── Blocker for: Step 10.

[STEP 10: Final Responsive QA & Delivery]
  └── Action: (Me) Cross-viewport verification (1440px, 768px, 390px) and handoff.
```

---

## 8. PART G — DO NOT CHANGE EXISTING FEATURES

Strictly preserved without modification:
1. **Cinematic Monument** ([`src/components/CinematicMonument.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/CinematicMonument.tsx))
2. **Living Atlas** ([`src/components/LivingAtlas.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/LivingAtlas.tsx))
3. **Museum in Motion** ([`src/components/MuseumInMotion.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/MuseumInMotion.tsx))
4. **Time Machine** ([`src/components/TimeMachine.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/TimeMachine.tsx))
5. **Monument Dissection** ([`src/components/MonumentDissection.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/MonumentDissection.tsx))
6. **Then / Now** ([`src/components/ThenNow.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/ThenNow.tsx))
7. **The Journey** ([`src/components/TheJourney.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/TheJourney.tsx))
8. **HeritageOS** ([`src/components/HeritageOS.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/HeritageOS.tsx))
9. **Existing Signup & Signin Experience** ([`src/components/AuthPage.tsx`](file:///c:/mini%20project/HeritageVerse/src/components/AuthPage.tsx))

**Directives:** No redesign. No rebuild. No replacement. No second authentication system.

---

## 9. PART H — SECURITY REQUIREMENTS

1. **Server-Side Enforcement:** Admin authorization must be strictly enforced on Express routes via `requireAdmin`. Client-side route guards are for UX only and provide no security.
2. **Password Integrity:** Passwords must remain hashed with bcrypt (minimum 10 rounds). Plaintext passwords must never be stored, logged, or transmitted in responses.
3. **Password Hash Protection:** `password_hash` must **never** be returned in `GET /api/admin/users` or any user query.
4. **Privilege Escalation Prevention:** Users must not be able to elevate their own role. `PATCH /api/admin/users/:id/role` must strictly require `role === 'admin'`.
5. **Credential Isolation:** Database credentials and JWT secrets must strictly reside in server-side environment variables and must never be committed to Git or bundled into frontend code.

---

## 10. PART I — QA ACCEPTANCE CRITERIA

| Test Category | Scenario | Expected HTTP Code | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **Auth** | Valid registration | `201 Created` | Returns user record and JWT token; password hashed in DB. |
| **Auth** | Duplicate email | `400 Bad Request` | Returns `{ success: false, message: "User already exists" }`. |
| **Auth** | Valid signin | `200 OK` | Returns user record with `role` and signed JWT token. |
| **Auth** | Invalid credentials | `401 Unauthorized` | Returns `{ success: false, message: "Invalid email or password" }`. |
| **Authorization** | Missing token on `/api/admin/*` | `401 Unauthorized` | Request rejected; message indicates authentication required. |
| **Authorization** | User role attempting `/api/admin/*` | `403 Forbidden` | Request rejected; message indicates admin required. |
| **Heritage CRUD** | Create site with valid fields | `201 Created` | Record inserted in PostgreSQL `heritage` table. |
| **Heritage CRUD** | Create site with missing fields | `400 Bad Request` | Returns field-level validation errors. |
| **Heritage CRUD** | Update non-existent site ID | `404 Not Found` | Returns resource not found error. |
| **Heritage CRUD** | Delete site | `200 OK` | Record removed or archived; UI list refreshes. |
| **User Role** | Elevate user to admin | `200 OK` | `users.role` updated to `'admin'`. |
| **Server Error** | Database connection failure | `500 Server Error` | Clean error JSON returned without leaking stack traces. |
| **Regression** | Interactive public modules | `N/A` | All 8 interactive experiences render and operate without console errors. |

---

## 11. PART J — NEW DOCUMENTATION FILE VERIFICATION

* **File Created:** [`docs/admin-implementation-contract.md`](file:///c:/mini%20project/HeritageVerse/docs/admin-implementation-contract.md)
* **Existing Files Modified:** **0 (ZERO)**
* **Existing Files Deleted:** **0 (ZERO)**
