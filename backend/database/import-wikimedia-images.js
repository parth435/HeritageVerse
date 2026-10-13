#!/usr/bin/env node
"use strict";

const pool = require("../config/db");
const { acquireImageForHeritage, createUserAgent, createWikimediaClient } = require("./wikimedia-images");

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULTS = { batchSize: 20, delayMs: 1000, concurrency: 1 };

function parsePositiveInteger(value, name, maximum) {
  if (!/^\d+$/.test(String(value ?? ""))) throw new Error(`${name} must be a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`${name} must be between 1 and ${maximum}`);
  return number;
}

function parseArguments(args) {
  const options = { apply: false, refresh: false, retryFailed: false, resume: false, limit: null, heritageId: null, batchSize: DEFAULTS.batchSize, delayMs: DEFAULTS.delayMs, concurrency: DEFAULTS.concurrency, ids: null, help: false };
  const allowedFlags = new Set(["--apply", "--dry-run", "--refresh", "--retry-failed", "--resume", "--limit", "--heritage-id", "--batch-size", "--delay-ms", "--concurrency", "--ids", "--help"]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowedFlags.has(flag)) throw new Error(`Unknown option: ${flag}`);
    if (flag === "--apply") options.apply = true;
    else if (flag === "--dry-run") options.apply = false;
    else if (flag === "--refresh") options.refresh = true;
    else if (flag === "--retry-failed") options.retryFailed = true;
    else if (flag === "--resume") options.resume = true;
    else if (flag === "--help") options.help = true;
    else {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
      index += 1;
      if (flag === "--batch-size") options.batchSize = parsePositiveInteger(value, "--batch-size", 500);
      if (flag === "--delay-ms") options.delayMs = parsePositiveInteger(value, "--delay-ms", 60000);
      if (flag === "--concurrency") options.concurrency = parsePositiveInteger(value, "--concurrency", 3);
      if (flag === "--limit") options.limit = parsePositiveInteger(value, "--limit", 100000);
      if (flag === "--heritage-id") options.heritageId = parsePositiveInteger(value, "--heritage-id", 2147483647);
      if (flag === "--ids") {
        const ids = value.split(",").map((part) => parsePositiveInteger(part.trim(), "--ids entries", 2147483647));
        if (new Set(ids).size !== ids.length) throw new Error("--ids cannot contain duplicate IDs");
        options.ids = ids;
      }
    }
  }
  if (options.retryFailed && options.refresh) throw new Error("--refresh and --retry-failed are separate selection modes and cannot be combined");
  if (options.resume && options.refresh) throw new Error("--resume and --refresh are separate selection modes and cannot be combined");
  if (options.heritageId !== null && options.ids !== null) throw new Error("Use either --heritage-id or --ids, not both");
  if (options.heritageId !== null) options.ids = [options.heritageId];
  if (options.delayMs < 1000) throw new Error("--delay-ms must be at least 1000 ms to keep Wikimedia requests paced");
  return options;
}

function usage() {
  return [
    "Usage: npm run images:import -- [options]",
    "",
    "Options:",
    "  --dry-run             Report candidates without writing heritage/media rows (default)",
    "  --apply               Save verified media and acquisition status; local non-production DB only",
    "  --ids 12,34           Process only the selected heritage IDs",
    "  --heritage-id 12      Process one existing heritage ID",
    "  --limit 5             Process at most N eligible heritage records",
    "  --batch-size 20       Number of records per progress batch (1-500)",
    "  --delay-ms 1000       Minimum spacing between upstream requests (1000-60000)",
    "  --concurrency 1       Concurrent heritage records (1-3; requests remain globally paced)",
    "  --retry-failed        Retry failed records (with --resume, also resume pending records)",
    "  --resume              Skip completed review/not-found/verified records after an interrupted apply run",
    "  --refresh             Recheck verified/not-found records; existing media is preserved",
    "  --help                Show this help",
  ].join("\n");
}

function selectImportRecords(records, options) {
  const skipped = { already_complete: 0, already_processed: 0, needs_review: 0, not_found: 0, failed: 0, not_failed: 0, limited: 0 };
  const selected = records.filter((record) => {
    if (!options.refresh && record.has_complete_coverage) { skipped.already_complete += 1; return false; }
    if (!options.refresh && record.acquisition_status === "verified") { skipped.already_processed += 1; return false; }
    if (options.retryFailed && record.acquisition_status === "failed") return true;
    if (options.retryFailed && !options.resume) {
      skipped.not_failed += 1;
      return false;
    }
    if (!options.refresh && record.acquisition_status === "not_found") { skipped.not_found += 1; return false; }
    if (!options.refresh && record.acquisition_status === "failed") { skipped.failed += 1; return false; }
    if (options.resume && record.acquisition_status === "needs_review") { skipped.needs_review += 1; return false; }
    return true;
  });
  const limited = options.limit === null || options.limit === undefined ? selected : selected.slice(0, options.limit);
  skipped.limited = selected.length - limited.length;
  return { records: limited, skipped };
}

async function loadHeritageRecords(ids) {
  const result = await pool.query(
    `SELECT h.id, h.name, h.state, h.district, h.locality, h.latitude, h.longitude, h.wikidata_qid,
            acquisition.status AS acquisition_status,
            EXISTS (
              SELECT 1 FROM heritage_media m
               WHERE m.heritage_id = h.id
                 AND m.media_type = 'image'
                 AND m.media_role = 'current'
                 AND m.verification_status = 'verified'
                 AND m.is_illustrative = FALSE
            ) AS has_verified_current,
            EXISTS (
              SELECT 1 FROM heritage_media m
               WHERE m.heritage_id = h.id
                 AND m.media_type = 'image'
                 AND m.media_role = 'historical'
                 AND m.verification_status = 'verified'
                 AND m.is_illustrative = FALSE
            ) AS has_verified_historical,
            EXISTS (
              SELECT 1 FROM heritage_media m
               WHERE m.heritage_id = h.id
                 AND m.media_type = 'image'
                 AND m.media_role = 'current'
                 AND m.verification_status = 'verified'
                 AND m.is_illustrative = FALSE
            ) AND EXISTS (
              SELECT 1 FROM heritage_media m
               WHERE m.heritage_id = h.id
                 AND m.media_type = 'image'
                 AND m.media_role = 'historical'
                 AND m.verification_status = 'verified'
                 AND m.is_illustrative = FALSE
            ) AS has_complete_coverage
       FROM heritage h
       LEFT JOIN heritage_image_acquisition acquisition ON acquisition.heritage_id = h.id
       WHERE ($1::INTEGER[] IS NULL OR h.id = ANY($1::INTEGER[]))
       ORDER BY h.id ASC`,
    [ids],
  );
  return result.rows;
}

async function loadCoverageReport(database = pool) {
  const result = await database.query(
    `WITH place_images AS (
       SELECT h.id,
              COALESCE(BOOL_OR(m.media_type = 'image' AND m.verification_status = 'verified' AND m.is_illustrative = FALSE), FALSE) AS has_any,
              COALESCE(BOOL_OR(m.media_type = 'image' AND m.media_role = 'current' AND m.verification_status = 'verified' AND m.is_illustrative = FALSE), FALSE) AS has_current,
              COALESCE(BOOL_OR(m.media_type = 'image' AND m.media_role = 'historical' AND m.verification_status = 'verified' AND m.is_illustrative = FALSE), FALSE) AS has_historical
         FROM heritage h
         LEFT JOIN heritage_image_acquisition current_acquisition ON current_acquisition.heritage_id = h.id
         LEFT JOIN heritage_media m ON m.heritage_id = h.id OR (
           COALESCE(h.wikidata_qid, current_acquisition.matched_qid) IS NOT NULL
           AND m.media_type = 'image'
           AND m.verification_status = 'verified'
           AND m.is_illustrative = FALSE
           AND EXISTS (
             SELECT 1 FROM heritage media_owner
             LEFT JOIN heritage_image_acquisition owner_acquisition ON owner_acquisition.heritage_id = media_owner.id
              WHERE media_owner.id = m.heritage_id
                AND COALESCE(media_owner.wikidata_qid, owner_acquisition.matched_qid) = COALESCE(h.wikidata_qid, current_acquisition.matched_qid)
           )
         )
        GROUP BY h.id
     )
     SELECT COUNT(*)::INTEGER AS total_places,
            COUNT(*) FILTER (WHERE has_current AND has_historical)::INTEGER AS complete_places,
            COUNT(*) FILTER (WHERE has_any AND NOT (has_current AND has_historical))::INTEGER AS partial_places,
            COUNT(*) FILTER (WHERE NOT has_any)::INTEGER AS missing_places,
            (SELECT COUNT(*)::INTEGER FROM heritage_media WHERE media_type = 'image' AND verification_status = 'verified' AND is_illustrative = FALSE) AS verified_image_assets,
            (SELECT COUNT(*)::INTEGER FROM heritage_media WHERE media_type = 'image' AND media_role = 'historical' AND verification_status = 'verified' AND is_illustrative = FALSE) AS historical_image_assets,
            (SELECT COUNT(*)::INTEGER FROM heritage_media WHERE media_type = 'image' AND media_role = 'current' AND verification_status = 'verified' AND is_illustrative = FALSE) AS current_image_assets,
            (SELECT COUNT(*)::INTEGER FROM heritage_image_acquisition WHERE status = 'needs_review') AS places_requiring_review,
            (SELECT COUNT(*)::INTEGER FROM heritage_image_acquisition WHERE status = 'failed') AS failed_acquisitions
       FROM place_images`,
  );
  const row = result.rows[0] ?? {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]));
}

async function saveOutcome(record, outcome, database = pool) {
  const client = await database.connect();
  const persistedOutcome = { ...outcome };
  try {
    await client.query("BEGIN");
    const proposedImages = persistedOutcome.images ?? (persistedOutcome.image ? [persistedOutcome.image] : []);
    for (const image of proposedImages) {
      if (!image?.url || !image?.filename || image.hasRequiredMetadata !== true) continue;
      const mediaRole = ["gallery", "historical", "current"].includes(image.mediaRole) ? image.mediaRole : "gallery";
      const dateContext = image.documentedDateSource
        ? `Photo date from Wikimedia Commons ${image.documentedDateSource}; kept as ${mediaRole}.`
        : "No reliable Commons photo date was supplied; role kept as gallery and not used as a dated hero.";
      const entityConfidence = persistedOutcome.entityConfidence ?? persistedOutcome.confidence;
      const confirmedQid = persistedOutcome.matchedQid && entityConfidence >= 0.95 ? persistedOutcome.matchedQid : null;
      const linkedElsewhere = await client.query(
        `SELECT m.id, m.heritage_id, owner.wikidata_qid, acquisition.matched_qid
           FROM heritage_media m
           JOIN heritage owner ON owner.id = m.heritage_id
           LEFT JOIN heritage_image_acquisition acquisition ON acquisition.heritage_id = owner.id
          WHERE m.heritage_id <> $1
            AND (m.url = $2 OR (m.provider = 'wikimedia' AND m.wikimedia_filename = $3))
          ORDER BY (m.verification_status = 'verified' AND NOT m.is_illustrative) DESC, m.id ASC
          LIMIT 1 FOR UPDATE OF m`,
        [record.id, image.url, image.filename],
      );
      if (linkedElsewhere.rows?.length) {
        const shared = linkedElsewhere.rows[0];
        const sameEntity = confirmedQid && (shared.wikidata_qid === confirmedQid || shared.matched_qid === confirmedQid);
        if (!sameEntity) {
          persistedOutcome.status = "needs_review";
          persistedOutcome.errorCode = "duplicate_asset_linked_elsewhere";
          persistedOutcome.errorMessage = "This Commons asset is already linked to a different heritage record and needs a human relationship review";
        }
        // Same-QID heritage rows share the existing verified media through the detail API.
        continue;
      }
      const inserted = await client.query(
        `INSERT INTO heritage_media
           (heritage_id, media_type, url, thumbnail_url, caption, alt_text, credit, license,
            documented_date, display_order, source_url, creator, license_url, media_role, media_context,
            verification_status, is_illustrative, source_accessed_on, provider,
            wikimedia_filename, match_confidence)
         VALUES ($1, 'image', $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13,
                 'verified', FALSE, CURRENT_DATE, 'wikimedia', $14, $15)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          record.id,
          image.url,
          image.thumbnailUrl,
          image.title,
          image.altText || record.name,
          image.credit,
          image.license,
          image.documentedDate,
          image.sourceUrl,
          image.creator,
          image.licenseUrl,
          mediaRole,
          dateContext,
          image.filename,
          persistedOutcome.confidence,
        ],
      );
      if (!inserted.rows?.length) {
        const duplicate = await client.query(
          `SELECT id, url, verification_status, media_role, is_illustrative
             FROM heritage_media
            WHERE heritage_id = $1
              AND (url = $2 OR (provider = 'wikimedia' AND wikimedia_filename = $3))
            ORDER BY (verification_status = 'verified' AND NOT is_illustrative) DESC, id ASC
            LIMIT 1 FOR UPDATE`,
          [record.id, image.url, image.filename],
        );
        const existing = duplicate.rows?.[0];
        if (existing?.verification_status === "verified" && existing.is_illustrative === false) {
          // A verified copy of this asset already exists; leave all its metadata untouched.
        } else if (existing?.url === image.url && existing.media_role === mediaRole && existing.is_illustrative === false) {
          const updated = await client.query(
            `UPDATE heritage_media
                SET thumbnail_url = $2, caption = $3, alt_text = $4, credit = $5, license = $6,
                    documented_date = $7, source_url = $8, creator = $9, license_url = $10, media_context = $11,
                    verification_status = 'verified', source_accessed_on = CURRENT_DATE,
                    provider = 'wikimedia', wikimedia_filename = $12, match_confidence = $13
              WHERE id = $1 AND media_type = 'image' AND media_role = $14
                AND verification_status <> 'verified' AND is_illustrative = FALSE
              RETURNING id`,
            [
              existing.id,
              image.thumbnailUrl,
              image.title,
              image.altText || record.name,
              image.credit,
              image.license,
              image.documentedDate,
              image.sourceUrl,
              image.creator,
              image.licenseUrl,
              dateContext,
              image.filename,
              persistedOutcome.confidence,
              mediaRole,
            ],
          );
          if (!updated.rows?.length) {
            persistedOutcome.status = "needs_review";
            persistedOutcome.errorCode = "existing_asset_requires_review";
            persistedOutcome.errorMessage = "An existing unverified asset could not be safely promoted automatically";
          }
        } else {
          persistedOutcome.status = "needs_review";
          persistedOutcome.errorCode = "duplicate_asset_requires_review";
          persistedOutcome.errorMessage = "A duplicate Commons filename or URL already exists with metadata that needs review";
        }
      }
    }
    const entityConfidence = persistedOutcome.entityConfidence ?? persistedOutcome.confidence;
    if (persistedOutcome.matchedQid && entityConfidence >= 0.95) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [persistedOutcome.matchedQid]);
      await client.query(
        `UPDATE heritage target
            SET wikidata_qid = COALESCE(target.wikidata_qid, $2), updated_at = NOW()
          WHERE target.id = $1
            AND (target.wikidata_qid IS NULL OR target.wikidata_qid = $2)
            AND NOT EXISTS (
              SELECT 1 FROM heritage other
               WHERE other.id <> target.id AND other.wikidata_qid = $2
            )`,
        [record.id, persistedOutcome.matchedQid],
      );
    }

    await client.query(
      `INSERT INTO heritage_image_acquisition
         (heritage_id, provider, status, match_confidence, matched_qid, candidates,
          error_code, error_message, retry_count, last_attempt_at, last_checked_at, updated_at)
       VALUES ($1, 'wikimedia', $2, $3, $4, $5::jsonb, $6, $7,
               CASE WHEN $2 = 'failed' THEN 1 ELSE 0 END, NOW(), NOW(), NOW())
       ON CONFLICT (heritage_id) DO UPDATE SET
         provider = EXCLUDED.provider,
         status = EXCLUDED.status,
         match_confidence = EXCLUDED.match_confidence,
         matched_qid = EXCLUDED.matched_qid,
         candidates = EXCLUDED.candidates,
         error_code = EXCLUDED.error_code,
         error_message = EXCLUDED.error_message,
         retry_count = heritage_image_acquisition.retry_count + CASE WHEN EXCLUDED.status = 'failed' THEN 1 ELSE 0 END,
         last_attempt_at = NOW(),
         last_checked_at = NOW(),
         updated_at = NOW()`,
      [
        record.id,
        persistedOutcome.status,
        persistedOutcome.confidence,
        persistedOutcome.matchedQid && entityConfidence >= 0.95 ? persistedOutcome.matchedQid : null,
        JSON.stringify(persistedOutcome.candidates ?? []),
        persistedOutcome.errorCode ?? null,
        persistedOutcome.errorMessage ? String(persistedOutcome.errorMessage).slice(0, 1000) : null,
      ],
    );
    await client.query("COMMIT");
    return persistedOutcome;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function summarizeOutcome(summary, outcome) {
  summary.processed += 1;
  if (outcome.status === "verified") summary.verified_candidates += 1;
  else if (outcome.status === "needs_review") summary.needs_review += 1;
  else if (outcome.status === "not_found") summary.not_found += 1;
  else summary.failed += 1;
}

async function mapConcurrent(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function processRecord(record, options, client, database = pool) {
  try {
    const diagnostics = {};
    const outcome = await acquireImageForHeritage(record, client, { diagnostics });
    outcome.searchQueries = diagnostics;
    return options.apply ? await saveOutcome(record, outcome, database) : outcome;
  } catch (error) {
    const outcome = {
      status: "failed",
      confidence: null,
      matchedQid: null,
      candidates: [],
      errorCode: typeof error?.code === "string" ? error.code : "import_error",
      errorMessage: error?.diagnosticCode ? `Image acquisition failed (${error.diagnosticCode})` : error?.message || "Image acquisition failed",
      diagnosticCode: typeof error?.diagnosticCode === "string" ? error.diagnosticCode : null,
    };
    return options.apply ? await saveOutcome(record, outcome, database) : outcome;
  }
}

async function run(options) {
  if (options.apply && (process.env.NODE_ENV === "production" || !LOCAL_DATABASE_HOSTS.has(String(pool.options.host).toLowerCase()))) {
    throw new Error("Apply mode is restricted to a local, non-production PostgreSQL database.");
  }
  const allRecords = await loadHeritageRecords(options.ids);
  const coverage = await loadCoverageReport();
  if (options.ids) {
    const found = new Set(allRecords.map((record) => Number(record.id)));
    const missing = options.ids.filter((id) => !found.has(id));
    if (missing.length) throw new Error(`Unknown heritage ID(s): ${missing.join(", ")}`);
  }
  const { records, skipped } = selectImportRecords(allRecords, options);

  const userAgent = records.length ? createUserAgent() : null;
  if (!records.length) {
    console.log(JSON.stringify({ mode: options.apply ? "apply" : "dry-run", total_sites_selected: allRecords.length, eligible: 0, processed: 0, verified_candidates: 0, needs_review: 0, not_found: 0, failed: 0, coverage_before: coverage, skipped }));
    return { processed: 0, eligible: 0, skipped };
  }
  const client = createWikimediaClient({
    userAgent,
    delayMs: options.delayMs,
    cacheStore: pool,
    writeCache: options.apply,
  });
  const summary = {
    mode: options.apply ? "apply" : "dry-run",
    total_sites_selected: allRecords.length,
    eligible: records.length,
    processed: 0,
    verified_candidates: 0,
    needs_review: 0,
    not_found: 0,
    failed: 0,
    skipped,
    batch_size: options.batchSize,
    concurrency: options.concurrency,
    request_delay_ms: options.delayMs,
    confidence_threshold: 0.95,
    writes_enabled: options.apply,
    coverage_before: coverage,
    dry_run_results: [],
  };

  for (let offset = 0; offset < records.length; offset += options.batchSize) {
    const batch = records.slice(offset, offset + options.batchSize);
    const outcomes = await mapConcurrent(batch, options.concurrency, (record) => processRecord(record, options, client));
    outcomes.forEach((outcome, index) => {
      summarizeOutcome(summary, outcome);
      const record = batch[index];
      summary.dry_run_results.push({
        heritage_id: record.id,
        name: record.name,
        state: record.state,
        district: record.district,
        locality: record.locality,
        heritage_coordinates: record.latitude == null || record.longitude == null ? null : { latitude: Number(record.latitude), longitude: Number(record.longitude) },
        status: outcome.status,
        matched_qid: outcome.matchedQid ?? null,
        match_confidence: outcome.confidence ?? null,
        search_queries: outcome.searchQueries ?? {},
        candidates: outcome.candidates ?? [],
        proposed_images: (outcome.images ?? (outcome.image ? [outcome.image] : [])).map((image) => ({
          filename: image.filename,
          image_url: image.url,
          thumbnail_url: image.thumbnailUrl,
          source_page: image.sourceUrl,
          creator: image.creator,
          license: image.license,
          license_url: image.licenseUrl,
          credit: image.credit,
          documented_date: image.documentedDate,
          documented_date_source: image.documentedDateSource,
          uploaded_at: image.uploadedAt,
          role: image.mediaRole ?? "gallery",
        })),
        error_code: outcome.errorCode ?? null,
        error_message: outcome.errorMessage ?? null,
        diagnostic_code: outcome.diagnosticCode ?? null,
      });
      if (outcome.status !== "verified") {
        summary.last_batch_details ??= [];
        summary.last_batch_details.push({ id: record.id, name: record.name, status: outcome.status, error_code: outcome.errorCode ?? null, confidence: outcome.confidence ?? null, diagnostic_code: outcome.diagnosticCode ?? null });
      }
    });
    console.log(JSON.stringify({
      progress: Math.min(offset + batch.length, records.length),
      eligible: records.length,
      verified_candidates: summary.verified_candidates,
      needs_review: summary.needs_review,
      not_found: summary.not_found,
      failed: summary.failed,
    }));
  }
  summary.last_batch_details = summary.last_batch_details?.slice(-options.batchSize) ?? [];
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function exitCodeForSummary(summary) {
  return summary.failed > 0 ? 1 : 0;
}

async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArguments(args);
    if (options.help) {
      console.log(usage());
      return;
    }
    const summary = await run(options);
    process.exitCode = exitCodeForSummary(summary);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Wikimedia image import did not complete: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { DEFAULTS, exitCodeForSummary, loadCoverageReport, loadHeritageRecords, main, parseArguments, parsePositiveInteger, processRecord, run, saveOutcome, selectImportRecords, usage };
