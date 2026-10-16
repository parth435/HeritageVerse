#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../config/db");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const reportMissing = args.includes("--report-missing");
const filenames = args.filter((arg) => !arg.startsWith("--"));
const inputFile = filenames[0] ? path.resolve(filenames[0]) : null;
const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(String(pool.options.host));
const MINIMUM_CONFIDENCE = 0.95;

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validate(candidate, index) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [`record ${index + 1}: expected an object`];
  for (const key of ["heritage_slug", "state", "source_title", "publisher", "source_url", "reviewed_by"]) {
    if (typeof candidate[key] !== "string" || !candidate[key].trim()) errors.push(`${key} is required`);
  }
  if (!isHttpsUrl(candidate.source_url)) errors.push("source_url must be a credential-free HTTPS URL");
  if (typeof candidate.latitude !== "number" || !Number.isFinite(candidate.latitude) || candidate.latitude < -90 || candidate.latitude > 90) errors.push("latitude must be a valid decimal number");
  if (typeof candidate.longitude !== "number" || !Number.isFinite(candidate.longitude) || candidate.longitude < -180 || candidate.longitude > 180) errors.push("longitude must be a valid decimal number");
  if (typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence) || candidate.confidence < MINIMUM_CONFIDENCE || candidate.confidence > 1) errors.push(`confidence must be between ${MINIMUM_CONFIDENCE} and 1`);
  if (candidate.review_status !== "approved") errors.push("review_status must be approved by a human reviewer before import");
  if (!dateValue(candidate.reviewed_on) || Date.parse(`${candidate.reviewed_on}T00:00:00Z`) > Date.now()) errors.push("reviewed_on must be a valid date no later than today");
  return errors.map((message) => `record ${index + 1}: ${message}`);
}

async function missingReport() {
  const result = await pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE latitude IS NULL AND longitude IS NULL)::int AS missing,
      COUNT(*) FILTER (WHERE (latitude IS NULL) <> (longitude IS NULL))::int AS partial
    FROM heritage WHERE publication_status='published'`);
  const sample = await pool.query(`SELECT slug, name, state
    FROM heritage WHERE publication_status='published' AND latitude IS NULL AND longitude IS NULL
    ORDER BY state, name, id LIMIT 20`);
  console.log(JSON.stringify({ mode: "read-only catalog report", ...result.rows[0], sample_missing: sample.rows, note: "This report does not generate coordinates. Every candidate must be supported by an exact source and approved by a reviewer." }, null, 2));
}

function normalizeState(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en") : "";
}

function coordinateApplyBlockReason(record, candidate) {
  const latitudeIsNull = record.latitude === null || record.latitude === undefined;
  const longitudeIsNull = record.longitude === null || record.longitude === undefined;
  if (latitudeIsNull !== longitudeIsNull) return "record has a partial coordinate pair; existing data will not be modified";
  if (!latitudeIsNull && (Number(record.latitude) !== candidate.latitude || Number(record.longitude) !== candidate.longitude)) {
    return "record already has a different coordinate pair; importer will not overwrite it";
  }
  if (record.coordinates_approved) return "record already has approved coordinates; existing coordinates and source metadata will not be modified";
  return null;
}

function candidatesFromInput(input, { apply = false } = {}) {
  if (Array.isArray(input)) return input;
  if (!input || input.mode !== "dry-run" || input.database_mutated !== false || !Array.isArray(input.records)) {
    throw new Error("Candidate input must be a JSON array or an unmodified coordinate dry-run report.");
  }
  const eligible = input.records.filter((record) =>
    record?.match_status === "needs_review" && (!apply || record.review_status === "approved"));
  if (!eligible.length && apply) {
    throw new Error("No eligible candidates are marked approved. Review a needs_review record and fill review_confidence (at least 0.95), reviewed_by, and reviewed_on first.");
  }
  return eligible.map((record) => {
    const source = record.source ?? {};
    const provenance = source.provenance && typeof source.provenance === "object"
      ? `Provenance: ${JSON.stringify(source.provenance)}.`
      : "";
    const sourceNote = [
      `Coordinate candidate discovered via ${source.provider ?? "an external source"}.`,
      source.attribution ? `Attribution: ${source.attribution}` : "",
      source.license ? `License: ${source.license}` : "",
      provenance,
      "Human reviewer checked the cited source and site match.",
    ].filter(Boolean).join(" ").slice(0, 2000);
    return {
      heritage_slug: record.site_slug,
      state: record.state,
      latitude: record.proposed_coordinates?.latitude,
      longitude: record.proposed_coordinates?.longitude,
      source_title: source.title,
      publisher: source.publisher,
      source_url: source.url,
      source_note: sourceNote,
      confidence: record.review_confidence,
      review_status: record.review_status,
      reviewed_by: record.reviewed_by,
      reviewed_on: record.reviewed_on,
    };
  });
}

function parseCandidateJson(contents) {
  if (typeof contents !== "string") throw new Error("Candidate file must contain JSON text.");
  return JSON.parse(contents.replace(/^\uFEFF/, ""));
}

async function main() {
  try {
    if (reportMissing) {
      if (apply || inputFile || filenames.length) throw new Error("Usage: node backend/database/enrich-coordinates.js --report-missing");
      await missingReport();
      return;
    }
    if (!inputFile || filenames.length !== 1 || !fs.existsSync(inputFile) || path.extname(inputFile) !== ".json") {
      throw new Error("Usage: node backend/database/enrich-coordinates.js <candidates.json> [--apply] or --report-missing");
    }
    if (apply && (process.env.NODE_ENV === "production" || !isLocalDatabase)) throw new Error("Apply mode is restricted to a local, non-production database.");
    const input = parseCandidateJson(fs.readFileSync(inputFile, "utf8"));
    const candidates = candidatesFromInput(input, { apply });
    if (!Array.isArray(candidates) || candidates.length === 0) throw new Error("The candidate file must contain a non-empty JSON array.");

    const results = [];
    for (const [index, candidate] of candidates.entries()) {
      const errors = validate(candidate, index);
      if (errors.length) {
        results.push({ slug: candidate?.heritage_slug ?? null, ready: false, reasons: errors });
        continue;
      }
      const heritage = await pool.query(`SELECT h.id, h.slug, h.state, h.latitude, h.longitude,
          EXISTS (SELECT 1 FROM heritage_sources s WHERE s.heritage_id=h.id
            AND 'coordinates'=ANY(s.claims_supported) AND s.review_status='approved') AS coordinates_approved
        FROM heritage h
        WHERE h.slug=$1 AND h.publication_status='published'`, [candidate.heritage_slug]);
      if (heritage.rows.length !== 1) {
        results.push({ slug: candidate.heritage_slug, ready: false, reasons: [heritage.rows.length ? "heritage slug is ambiguous" : "published heritage record not found"] });
        continue;
      }
      const record = heritage.rows[0];
      if (normalizeState(record.state) !== normalizeState(candidate.state)) {
        results.push({ slug: candidate.heritage_slug, ready: false, reasons: ["state does not match the exact heritage record"] });
        continue;
      }
      const existing = await pool.query(`SELECT claims_supported, confidence, review_status FROM heritage_sources
        WHERE heritage_id=$1 AND source_url=$2`, [record.id, candidate.source_url]);
      const hasCoordinates = record.latitude !== null && record.longitude !== null;
      const samePair = hasCoordinates && Number(record.latitude) === candidate.latitude && Number(record.longitude) === candidate.longitude;
      if (existing.rows.length) {
        const source = existing.rows[0];
        const alreadyApproved = samePair && source.review_status === "approved" && source.confidence !== null && Number(source.confidence) === candidate.confidence && source.claims_supported.includes("coordinates");
        results.push({ slug: candidate.heritage_slug, ready: alreadyApproved, already_applied: alreadyApproved, reasons: alreadyApproved ? [] : ["source URL is already attached to this record; existing source metadata will not be changed"] });
        continue;
      }
      const blockReason = coordinateApplyBlockReason(record, candidate);
      if (blockReason) {
        results.push({ slug: candidate.heritage_slug, id: record.id, ready: false, reasons: [blockReason] });
        continue;
      }
      results.push({ slug: candidate.heritage_slug, id: record.id, ready: true, already_applied: false, latitude: candidate.latitude, longitude: candidate.longitude, confidence: candidate.confidence, review_status: candidate.review_status, source_url: candidate.source_url });
    }

    const rejected = results.filter((result) => !result.ready);
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", candidates: candidates.length, ready: results.filter((result) => result.ready).length, rejected: rejected.length, minimum_confidence: MINIMUM_CONFIDENCE, results }, null, 2));
    if (!apply || !results.some((result) => result.ready && !result.already_applied)) return;
    if (rejected.length) throw new Error("Apply refused: resolve every rejected or unapproved candidate and rerun the dry-run report.");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [index, candidate] of candidates.entries()) {
        const result = results[index];
        if (result.already_applied) continue;
        const locked = await client.query(`SELECT h.id, h.latitude, h.longitude, h.state,
            EXISTS (SELECT 1 FROM heritage_sources s WHERE s.heritage_id=h.id
              AND 'coordinates'=ANY(s.claims_supported) AND s.review_status='approved') AS coordinates_approved
          FROM heritage h WHERE h.id=$1 AND h.publication_status='published' FOR UPDATE OF h`, [result.id]);
        const current = locked.rows[0];
        if (!current || normalizeState(current.state) !== normalizeState(candidate.state)) throw new Error(`record ${index + 1}: heritage record changed after dry-run`);
        const blockReason = coordinateApplyBlockReason(current, candidate);
        if (blockReason) throw new Error(`record ${index + 1}: ${blockReason}`);
        if (current.latitude === null && current.longitude === null) {
          const updated = await client.query(`UPDATE heritage SET latitude=$1, longitude=$2, updated_at=NOW()
            WHERE id=$3 AND latitude IS NULL AND longitude IS NULL`, [candidate.latitude, candidate.longitude, result.id]);
          if (updated.rowCount !== 1) throw new Error(`record ${index + 1}: coordinate pair changed before it could be applied`);
        }
        const sourceNote = typeof candidate.source_note === "string" && candidate.source_note.trim()
          ? candidate.source_note.trim().slice(0, 2000)
          : "Coordinate pair reviewed against the cited source and approved for map and route use.";
        await client.query(`INSERT INTO heritage_sources
          (heritage_id, source_name, source_title, publisher, source_url, source_note, accessed_on,
           claims_supported, confidence, review_status, reviewed_by, reviewed_on)
          VALUES ($1,$2,$3,$2,$4,$5,CURRENT_DATE,ARRAY['coordinates']::TEXT[],$6,'approved',$7,$8)`,
        [result.id, candidate.publisher.trim(), candidate.source_title.trim(), candidate.source_url, sourceNote, candidate.confidence, candidate.reviewed_by.trim(), candidate.reviewed_on]);
      }
      await client.query("COMMIT");
      console.log(`Applied ${results.filter((result) => result.ready && !result.already_applied).length} approved coordinate candidate(s).`);
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
    console.error(`Coordinate enrichment not applied: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { MINIMUM_CONFIDENCE, candidatesFromInput, coordinateApplyBlockReason, dateValue, isHttpsUrl, normalizeState, parseCandidateJson, validate };
