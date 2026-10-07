# HeritageVerse API

Base URL: `http://localhost:5000`

Responses are JSON. Error responses use `{ "success": false, "message": "..." }` and do not include database or password details.

## Health checks

### `GET /`

Returns `{ "success": true, "message": "HeritageVerse Backend is running!" }`.

### `GET /test-db`

Runs a database connectivity check. A connection failure returns `500` with a generic error message.

## Authentication

### `POST /api/auth/signup`

Send JSON with `name`, `email`, and `password`. Names must contain at least two characters and passwords at least six. Email is normalized to lowercase.

Returns `201 Created` with `success`, `message`, a safe `user` object (`id`, `name`, `email`, `created_at`), and a JWT `token`. Missing or invalid fields return `400`; a duplicate email returns `409`.

### `POST /api/auth/signin`

Send JSON with `email` and `password`.

Returns `200 OK` with `success`, `message`, a safe `user` object (`id`, `name`, `email`), and a JWT `token`. Missing fields return `400`; invalid credentials return `401`.

### `GET /api/auth/me`

Returns the authenticated user's `id`, `name`, `email`, and `created_at` in a `user` object.

Send the JWT returned by signup or signin:

```http
Authorization: Bearer <token>
```

Missing, malformed, invalid, or expired tokens return `401`. If the user no longer exists, the endpoint returns `404`.

JWTs use the configured `JWT_SECRET`, contain the user ID as the `sub` claim, use HS256, and default to a 24-hour expiration. `JWT_EXPIRES_IN` may override the expiration duration.

## Public heritage API

### `GET /api/categories`

Returns all rows in `heritage_categories`, ordered by name and ID:

```json
{ "success": true, "categories": [{ "id": 1, "name": "...", "slug": "..." }] }
```

### `GET /api/heritage`

Returns only published heritage records. Optional query parameters:

- `q`: case-insensitive search across name, description, history, and cultural significance
- `category`: exact category slug
- `state`: exact state value from the database
- `district`: exact district value from the database
- `limit`: integer from 1 to 100; defaults to 20
- `offset`: integer from 0 to 1,000,000; defaults to 0

Items are ordered by name and ID. Each item contains the heritage fields, a `category` object, `image_url` for the first image by display order when available, and a `media` array containing that selected image (or an empty array).

```json
{
  "success": true,
  "items": [],
  "pagination": { "limit": 20, "offset": 0, "total": 0 }
}
```

Invalid or repeated text filters and invalid/out-of-range pagination values return `400`.

### `GET /api/heritage/:id`

Returns a published heritage record by positive numeric database ID. The `heritage` object includes its category and ordered arrays for media, timeline events, artifacts, architectural layers, and sources.

Malformed IDs return `400`; missing or unpublished records return `404`; unexpected database errors return `500`.

## CORS

The server uses the Express CORS middleware with its default configuration so the current frontend can call the API.
