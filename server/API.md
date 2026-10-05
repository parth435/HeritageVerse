# HeritageVerse API

Base URL: `http://localhost:5000`

All responses use `{ "success": boolean, "message"?: string }`. Error responses do not include database or password details.

## Authentication

### `POST /api/auth/signup`

Creates an account. Send JSON with `name`, `email`, and `password`. Names must contain at least two characters and passwords at least six.

Returns `201 Created` with a `user` object containing `id`, `name`, `email`, and `created_at`. A duplicate email returns `409 Conflict`.

### `POST /api/auth/signin`

Authenticates an existing account. Send JSON with `email` and `password`.

Returns `200 OK` with a safe `user` object and a JWT `token`. The frontend stores this token after sign-in.

### `GET /api/auth/me`

Returns the authenticated user's `id`, `name`, `email`, and `created_at`.

Send the JWT returned by signin:

```http
Authorization: Bearer <token>
```

Missing, invalid, or expired tokens return `401 Unauthorized`.

## Schema-dependent APIs

`/api/heritage`, `/api/favorites`, `/api/visited`, `/api/reviews`, and `/api/journeys` are not implemented yet. The current database contains only `users`; implementing these routes requires approved tables, foreign keys, constraints, and ownership rules from the database owner before routes can be added safely.
