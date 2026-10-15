"use strict";

const NORMALIZED_EMAIL_PREDICATE = "LOWER(BTRIM(email)) = $1";

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function selectUniqueAccount(rows) {
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

module.exports = { NORMALIZED_EMAIL_PREDICATE, normalizeEmail, selectUniqueAccount };
