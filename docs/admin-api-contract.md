# HeritageVerse Admin API Contract Specification

**Document Version:** 1.0.0  
**Status:** DRAFT / PROPOSED ARCHITECTURE  
**Target Repository:** [parth435/HeritageVerse](https://github.com/parth435/HeritageVerse.git)  
**Backend Framework:** Node.js / Express 5  
**Database:** PostgreSQL  
**Primary Backend Owner:** Parth  
**Database / Schema Owner:** Vanashri  
**Admin / Integration Lead:** Integration Engineer  

---

## 1. Overview & Classification Legend

This document defines the formal HTTP REST interface for the HeritageVerse Admin System.

Every endpoint below is classified as either:
* **`[EXISTING API]`**: Currently implemented and running in [`server/index.js`](file:///c:/mini%20project/HeritageVerse/server/index.js).
* **`[PLANNED API]`**: Proposed endpoint required for complete frontend-to-database integration. Pending backend implementation by Parth.

All request and response bodies use standard `application/json`. Authenticated endpoints require an HTTP header:
`Authorization: Bearer <jwt_token>`

---

## 2. Authentication Endpoints

### 2.1 Register New Account `[EXISTING API]`
* **Method:** `POST`
* **Endpoint:** `/api/auth/signup`
* **Purpose:** Create a standard platform user account with bcrypt password hashing.
* **Authentication Requirement:** None (Public)
* **Admin Authorization Requirement:** None
* **Database Dependency:** `users` table (`name`, `email`, `password_hash`, `created_at`)
* **Backend Owner:** Parth
* **Request Body:**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "securePassword123"
  }
  ```
* **Success Response (HTTP 201 Created):**
  ```json
  {
    "success": true,
    "message": "Account created successfully",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "created_at": "2026-10-05T18:30:00.000Z"
    }
  }
  ```
* **Error Response (HTTP 400 Bad Request):**
  ```json
  {
    "success": false,
    "message": "User already exists with this email"
  }
  ```

---

### 2.2 Authenticate User `[EXISTING API]`
* **Method:** `POST`
* **Endpoint:** `/api/auth/signin`
* **Purpose:** Validate user credentials via bcrypt comparison and return session data.
* **Authentication Requirement:** None (Public)
* **Admin Authorization Requirement:** None
* **Database Dependency:** `users` table
* **Backend Owner:** Parth
* **Request Body:**
  ```json
  {
    "email": "jane@example.com",
    "password": "securePassword123"
  }
  ```
* **Current Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com"
    }
  }
  ```
* **PLANNED Extension for Admin RBAC:** Return `token` and `role`:
  ```json
  {
    "success": true,
    "message": "Login successful",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "admin"
    }
  }
  ```

---

## 3. Planned Admin Endpoints

### 3.1 Dashboard Statistics `[PLANNED API]`
* **Method:** `GET`
* **Endpoint:** `/api/admin/stats`
* **Purpose:** Provide live aggregated count metrics for dashboard KPI cards.
* **Authentication Requirement:** Valid JWT (`Bearer <token>`)
* **Admin Authorization Requirement:** Yes (`role === 'admin'`)
* **Database Dependency:** `SELECT COUNT(*) FROM heritage;`, `SELECT COUNT(*) FROM users;`, `SELECT COUNT(*) FROM heritage_timeline_events;`
* **Backend Owner:** Parth
* **Request Body:** None
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "heritageSitesCount": 25,
      "heritageSitesChange": "+3 this month",
      "registeredUsersCount": 142,
      "registeredUsersChange": "+12.4%",
      "timelineEventsCount": 86,
      "timelineEventsChange": "+6 this month",
      "publishedStoriesCount": 18,
      "publishedStoriesChange": "+2 this month"
    }
  }
  ```

---

### 3.2 List Heritage Sites `[PLANNED API]`
* **Method:** `GET`
* **Endpoint:** `/api/heritage`
* **Purpose:** Fetch heritage sites for Admin table view with search, state, and status filters.
* **Query Parameters:**
  * `search` (optional string): Case-insensitive name match (`ILIKE`)
  * `state` (optional string): State filter (e.g. `Maharashtra`)
  * `status` (optional string): `published`, `draft`, or `archived`
* **Authentication Requirement:** None for public published sites; Admin token required to view drafts/archived.
* **Admin Authorization Requirement:** Yes for drafts/archived.
* **Database Dependency:** `heritage` table JOIN `heritage_categories`
* **Backend Owner:** Parth
* **Request Body:** None
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "1",
        "name": "Panhala Fort",
        "slug": "panhala-fort",
        "location": "Kolhapur, Maharashtra",
        "state": "Maharashtra",
        "category": "Fort",
        "era": "17th Century",
        "status": "PUBLISHED",
        "updatedAt": "2 hours ago",
        "image": "https://images.unsplash.com/photo-1609920658906-8223bd289001?auto=format&fit=crop&w=500&q=80",
        "description": "Historic hill fort in the Sahyadri mountains."
      }
    ]
  }
  ```

---

### 3.3 Create Heritage Site `[PLANNED API]`
* **Method:** `POST`
* **Endpoint:** `/api/heritage`
* **Purpose:** Insert a new monument record into PostgreSQL.
* **Authentication Requirement:** Valid JWT
* **Admin Authorization Requirement:** Yes (`role === 'admin'`)
* **Database Dependency:** `heritage` table, `heritage_categories` table
* **Backend Owner:** Parth
* **Request Body:**
  ```json
  {
    "name": "Raigad Fort",
    "location": "Raigad, Maharashtra",
    "state": "Maharashtra",
    "category": "Fort",
    "era": "17th Century",
    "status": "PUBLISHED",
    "description": "Hill fort situated in Mahad, Maharashtra, India.",
    "image": "https://example.com/raigad.jpg"
  }
  ```
* **Success Response (HTTP 201 Created):**
  ```json
  {
    "success": true,
    "message": "Heritage site created successfully",
    "data": {
      "id": "26",
      "name": "Raigad Fort",
      "slug": "raigad-fort",
      "status": "PUBLISHED"
    }
  }
  ```

---

### 3.4 Update Heritage Site `[PLANNED API]`
* **Method:** `PUT`
* **Endpoint:** `/api/heritage/:id`
* **Purpose:** Update existing heritage site details or change publication status.
* **Authentication Requirement:** Valid JWT
* **Admin Authorization Requirement:** Yes (`role === 'admin'`)
* **Database Dependency:** `heritage` table (triggers update of `updated_at`)
* **Backend Owner:** Parth
* **Request Body:**
  ```json
  {
    "name": "Raigad Fort Capital",
    "status": "PUBLISHED",
    "description": "Updated historical summary."
  }
  ```
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Heritage site updated successfully",
    "data": {
      "id": "26",
      "name": "Raigad Fort Capital",
      "updatedAt": "Just now"
    }
  }
  ```

---

### 3.5 Delete Heritage Site `[PLANNED API]`
* **Method:** `DELETE`
* **Endpoint:** `/api/heritage/:id`
* **Purpose:** Remove or soft-archive a heritage site by ID.
* **Authentication Requirement:** Valid JWT
* **Admin Authorization Requirement:** Yes (`role === 'admin'`)
* **Database Dependency:** `heritage` table (cascades to media/timeline if deleted)
* **Backend Owner:** Parth
* **Request Body:** None
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Heritage site deleted successfully",
    "data": { "id": "26" }
  }
  ```

---

### 3.6 Timeline Events CRUD `[PLANNED API]`
* **Method:** `GET` / `POST` / `PUT` / `DELETE`
* **Endpoint:** `/api/timeline` & `/api/timeline/:id`
* **Purpose:** Manage chronological inscription events.
* **Authentication Requirement:** Admin JWT for writes; public for reads.
* **Admin Authorization Requirement:** Yes for writes.
* **Database Dependency:** `heritage_timeline_events` table (FK `heritage_id`)
* **Backend Owner:** Parth
* **Request Body (POST):**
  ```json
  {
    "year": "1674",
    "event": "Coronation of Shivaji",
    "description": "Coronation ceremony held at Raigad Fort.",
    "heritageId": 26,
    "status": "PUBLISHED"
  }
  ```

---

### 3.7 User Role & Status Management `[PLANNED API]`
* **Method:** `GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `PATCH /api/admin/users/:id/status`
* **Purpose:** Admin management of registered accounts, role elevation, and suspension.
* **Authentication Requirement:** Valid JWT
* **Admin Authorization Requirement:** Yes (`role === 'admin'`)
* **Database Dependency:** `users` table (Requires additive `role` and `status` columns)
* **Backend Owner:** Parth / Vanashri
* **Request Body (PATCH role):**
  ```json
  { "role": "admin" }
  ```
* **Success Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "User role updated successfully",
    "data": { "id": "5", "name": "Diya Nair", "role": "admin" }
  }
  ```

---

### 3.8 Media Reference Library `[PLANNED API]`
* **Method:** `GET /api/media`, `POST /api/media`, `DELETE /api/media/:id`
* **Purpose:** Manage image/media links linked to monuments.
* **Authentication Requirement:** Admin JWT for writes.
* **Admin Authorization Requirement:** Yes (`role === 'admin'`)
* **Database Dependency:** `heritage_media` table
* **Backend Owner:** Parth
