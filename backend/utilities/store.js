/**
 * The merged admin PR originally used an in-memory CMS with seeded demo
 * accounts. That store is intentionally not loaded by the API.
 *
 * Authentication, authorization, and heritage CRUD persist only in PostgreSQL.
 * Administrator promotion is an out-of-band database operation; see
 * `node backend/database/promote-admin.js --help`.
 */

module.exports = {};
