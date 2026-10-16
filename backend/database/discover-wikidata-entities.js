#!/usr/bin/env node
"use strict";

const pool = require("../config/db");
const { createUserAgent, createWikimediaClient, discoverEntityMatch } = require("./wikimedia-images");

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function positiveInteger(value, name, maximum) {
  if (!/^\d+$/.test(String(value ?? ""))) throw new Error(`${name} must be a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`${name} must be between 1 and ${maximum}`);
  return number;
}

function parseArguments(args) {
  const options = { apply: false, refresh: false, retryFailed: false, batchSize: 20, delayMs: 1000, concurrency: 1, ids: null, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--apply") options.apply = true;
    else if (flag === "--dry-run") options.apply = false;
    else if (flag === "--refresh") options.refresh = true;
    else if (flag === "--retry-failed") options.retryFailed = true;
    else if (flag === "--help") options.help = true;
    else if (["--batch-size", "--delay-ms", "--concurrency", "--ids"].includes(flag)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
      index += 1;
      if (flag === "--batch-size") options.batchSize = positiveInteger(value, flag, 500);
      if (flag === "--delay-ms") options.delayMs = positiveInteger(value, flag, 60000);
      if (flag === "--concurrency") options.concurrency = positiveInteger(value, flag, 3);
      if (flag === "--ids") {
        options.ids = value.split(",").map((id) => positiveInteger(id.trim(), "--ids entries", 2147483647));
        if (new Set(options.ids).size !== options.ids.length) throw new Error("--ids cannot contain duplicate IDs");
      }
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (options.retryFailed && options.refresh) throw new Error("--refresh and --retry-failed are separate selection modes and cannot be combined");
  if (options.delayMs < 1000) throw new Error("--delay-ms must be at least 1000 ms to keep Wikimedia requests paced");
  return options;
}

function usage() {
  return [
    "Usage: node backend/database/discover-wikidata-entities.js [options]",
    "",
    "Searches Wikidata and stores only high-confidence QIDs on existing heritage rows.",
    "Dry-run is the default; --apply is restricted to a local non-production database.",
    "Options: --dry-run | --apply | --ids 12,34 | --batch-size 20 | --delay-ms 1000 | --concurrency 1 | --retry-failed | --refresh | --help",
  ].join("\n");
}

async function loadRecords(ids) {
  const result = await pool.query(
    `SELECT h.id, h.name, h.state, h.district, h.locality, h.latitude, h.longitude, h.wikidata_qid,
            matches.status AS match_status
       FROM heritage h
       LEFT JOIN heritage_entity_matches matches ON matches.heritage_id = h.id
       WHERE ($1::INTEGER[] IS NULL OR h.id = ANY($1::INTEGER[]))
       ORDER BY h.id ASC`,
    [ids],
  );
  return result.rows;
}

function selectRecords(records, options) {
  const skipped = { already_matched: 0, not_failed: 0 };
  const selected = records.filter((record) => {
    if (options.retryFailed) {
      if (record.match_status !== "failed") { skipped.not_failed += 1; return false; }
      return true;
    }
    if (!options.refresh && record.wikidata_qid && record.match_status === "matched") { skipped.already_matched += 1; return false; }
    if (!options.refresh && record.match_status === "not_found") { skipped.already_matched += 1; return false; }
    if (!options.refresh && record.match_status === "failed") { skipped.already_matched += 1; return false; }
    return true;
  });
  return { selected, skipped };
}

async function saveOutcome(record, outcome, database = pool) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    if (outcome.status === "matched" && outcome.matchedQid && outcome.confidence >= 0.95) {
      await client.query(
        "UPDATE heritage SET wikidata_qid = COALESCE(wikidata_qid, $2), updated_at = NOW() WHERE id = $1 AND (wikidata_qid IS NULL OR wikidata_qid = $2)",
        [record.id, outcome.matchedQid],
      );
    }
    await client.query(
      `INSERT INTO heritage_entity_matches
         (heritage_id, status, matched_qid, match_confidence, candidates, error_code, error_message,
          retry_count, last_attempt_at, last_checked_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, CASE WHEN $2 = 'failed' THEN 1 ELSE 0 END, NOW(), NOW(), NOW())
       ON CONFLICT (heritage_id) DO UPDATE SET
         status = EXCLUDED.status,
         matched_qid = EXCLUDED.matched_qid,
         match_confidence = EXCLUDED.match_confidence,
         candidates = EXCLUDED.candidates,
         error_code = EXCLUDED.error_code,
         error_message = EXCLUDED.error_message,
         retry_count = heritage_entity_matches.retry_count + CASE WHEN EXCLUDED.status = 'failed' THEN 1 ELSE 0 END,
         last_attempt_at = NOW(), last_checked_at = NOW(), updated_at = NOW()`,
      [record.id, outcome.status, outcome.matchedQid ?? null, outcome.confidence ?? null, JSON.stringify(outcome.candidates ?? []), outcome.errorCode ?? null, outcome.errorMessage ? String(outcome.errorMessage).slice(0, 1000) : null],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function mapConcurrent(items, concurrency, callback) {
  let next = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await callback(items[index]);
    }
  }));
  return results;
}

async function run(options, database = pool) {
  if (options.apply && (process.env.NODE_ENV === "production" || !LOCAL_DATABASE_HOSTS.has(String(database.options?.host).toLowerCase()))) {
    throw new Error("Apply mode is restricted to a local, non-production PostgreSQL database.");
  }
  const allRecords = await loadRecords(options.ids);
  if (options.ids) {
    const found = new Set(allRecords.map((record) => Number(record.id)));
    const missing = options.ids.filter((id) => !found.has(id));
    if (missing.length) throw new Error(`Unknown heritage ID(s): ${missing.join(", ")}`);
  }
  const { selected, skipped } = selectRecords(allRecords, options);
  const summary = { mode: options.apply ? "apply" : "dry-run", total_sites_selected: allRecords.length, eligible: selected.length, processed: 0, matched: 0, needs_review: 0, not_found: 0, failed: 0, skipped, confidence_threshold: 0.95 };
  if (!selected.length) {
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }
  const client = createWikimediaClient({
    userAgent: createUserAgent(),
    delayMs: options.delayMs,
    cacheStore: database,
    writeCache: options.apply,
  });

  for (let offset = 0; offset < selected.length; offset += options.batchSize) {
    const batch = selected.slice(offset, offset + options.batchSize);
    const outcomes = await mapConcurrent(batch, options.concurrency, async (record) => {
      let outcome;
      try { outcome = await discoverEntityMatch(record, client); }
      catch (error) {
        outcome = { status: "failed", matchedQid: null, confidence: null, candidates: [], errorCode: error?.code || "discovery_error", errorMessage: error?.message || "Wikidata entity discovery failed" };
      }
      if (options.apply) await saveOutcome(record, outcome, database);
      return outcome;
    });
    for (const outcome of outcomes) {
      summary.processed += 1;
      if (outcome.status === "matched") summary.matched += 1;
      else if (outcome.status === "needs_review") summary.needs_review += 1;
      else if (outcome.status === "not_found") summary.not_found += 1;
      else summary.failed += 1;
    }
    console.log(JSON.stringify({ progress: Math.min(offset + batch.length, selected.length), eligible: selected.length, matched: summary.matched, needs_review: summary.needs_review, not_found: summary.not_found, failed: summary.failed }));
  }
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArguments(args);
    if (options.help) { console.log(usage()); return; }
    await run(options);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Wikidata entity discovery did not complete: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { loadRecords, main, parseArguments, run, saveOutcome, selectRecords, usage };
