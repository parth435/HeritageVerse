#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../config/db");

const defaultFile = path.resolve(__dirname, "source-data", "then-now-images.json");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const filenames = args.filter((arg) => arg !== "--apply");
const inputFile = path.resolve(filenames[0] ?? defaultFile);
const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(String(pool.options.host));
const supportedLicenses = new Map([
  ["CC0 1.0 Universal Public Domain Dedication", "https://creativecommons.org/publicdomain/zero/1.0/"],
  ["Creative Commons Attribution 4.0 International", "https://creativecommons.org/licenses/by/4.0/"],
  ["Creative Commons Attribution-ShareAlike 4.0 International", "https://creativecommons.org/licenses/by-sa/4.0/"],
]);

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validate(item, index) {
  const errors = [];
  const required = ["heritage_slug", "title", "url", "source_url", "creator", "credit", "documented_date", "license", "license_url", "alt_text", "media_context"];
  for (const key of required) if (typeof item?.[key] !== "string" || !item[key].trim()) errors.push(`${key} is required`);
  if (!supportedLicenses.has(item?.license) || item?.license_url !== supportedLicenses.get(item?.license)) errors.push("license is not in the reviewed reuse allowlist");
  if (!validHttpsUrl(item?.url)) errors.push("image URL must be HTTPS");
  if (!validHttpsUrl(item?.source_url)) errors.push("source URL must be HTTPS");
  if (!validHttpsUrl(item?.license_url)) errors.push("license URL must be HTTPS");
  if (!["historical", "current"].includes(item?.media_role)) errors.push("media_role must be historical or current");
  if (item?.review_status !== "verified") errors.push("review_status must be verified before import");
  if (item?.is_illustrative === true) errors.push("illustrative assets cannot be imported as authentic comparison photographs");
  return errors.map((message) => `record ${index + 1}: ${message}`);
}

async function main() {
  try {
    if (filenames.length > 1 || !fs.existsSync(inputFile) || path.extname(inputFile) !== ".json") {
      throw new Error("Usage: node backend/database/import-media.js [source-file.json] [--apply]");
    }
    if (apply && (process.env.NODE_ENV === "production" || !isLocalDatabase)) {
      throw new Error("Apply mode is restricted to a local, non-production database.");
    }
    const parsed = JSON.parse(fs.readFileSync(inputFile, "utf8"));
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("The source file must contain a non-empty JSON array.");
    const validationErrors = parsed.flatMap(validate);
    const pairRoles = new Map();
    for (const item of parsed) {
      const key = item?.heritage_slug;
      const roles = pairRoles.get(key) ?? [];
      roles.push(item?.media_role);
      pairRoles.set(key, roles);
    }
    for (const [slug, roles] of pairRoles) {
      if (roles.filter((role) => role === "historical").length !== 1 || roles.filter((role) => role === "current").length !== 1) {
        validationErrors.push(`${slug}: exactly one historical and one current image are required for a comparison`);
      }
    }
    if (validationErrors.length) throw new Error(validationErrors.join("; "));

    const ready = [];
    const skipped = [];
    for (const item of parsed) {
      const heritage = await pool.query("SELECT id, slug FROM heritage WHERE slug=$1 AND publication_status='published'", [item.heritage_slug]);
      if (heritage.rows.length !== 1) {
        skipped.push({ slug: item.heritage_slug, role: item.media_role, reason: heritage.rows.length ? "ambiguous heritage match" : "published heritage record not found" });
        continue;
      }
      const existing = await pool.query("SELECT id, media_role, source_url, license FROM heritage_media WHERE heritage_id=$1 AND url=$2", [heritage.rows[0].id, item.url]);
      if (existing.rows.length) {
        skipped.push({ slug: item.heritage_slug, role: item.media_role, reason: "image URL already exists; existing metadata preserved" });
        continue;
      }
      ready.push({ ...item, heritage_id: heritage.rows[0].id });
    }

    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", records_read: parsed.length, ready_to_insert: ready.length, skipped, records: ready.map((item) => ({ slug: item.heritage_slug, role: item.media_role, title: item.title, source_url: item.source_url, creator: item.creator, documented_date: item.documented_date, license: item.license })) }, null, 2));
    if (!apply || ready.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of ready) {
        await client.query(`INSERT INTO heritage_media
          (heritage_id, media_type, url, caption, alt_text, credit, license, display_order,
           source_url, creator, documented_date, license_url, media_role, media_context,
           verification_status, is_illustrative, source_accessed_on)
          VALUES ($1, 'image', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'verified', FALSE, CURRENT_DATE)
          ON CONFLICT (heritage_id, url) DO NOTHING`, [item.heritage_id, item.url, item.title, item.alt_text, item.credit, item.license, item.media_role === "historical" ? 900 : 901, item.source_url, item.creator, item.documented_date, item.license_url, item.media_role, item.media_context]);
      }
      await client.query("COMMIT");
      console.log(`Applied ${ready.length} reviewed media record(s); any concurrent duplicate URL was left unchanged.`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Media import not applied: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { supportedLicenses, validate };
