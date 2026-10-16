#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const SOURCE_URL = "https://asi.nic.in/pdf/CPM_List.pdf";
const SOURCE_TITLE = "Centrally Protected Monuments/Sites: State-wise and Circle-wise";
const PUBLISHER = "Archaeological Survey of India";
const DEFAULT_SOURCE = path.join(__dirname, "source-data", "ASI_CPM_List.pdf");
const CATEGORY_NAME = "ASI protected site";
const CATEGORY_SLUG = "asi-protected";
const NOT_RECORDED = "Not recorded in the imported ASI list.";
const MIN_RECORDS = 500;

const stateAliases = [
  [/\bN\.?C\.?T\.?\s*(?:of\s*)?Delhi\b/i, "Delhi"],
  [/\bDaman\s*&\s*Diu\b/i, "Daman & Diu (U.T.)"],
  [/\bJammu\s*&\s*Kashmir\b/i, "Jammu & Kashmir (U.T.)"],
  [/\bAndhra Pradesh\b/i, "Andhra Pradesh"],
  [/\bArunachal Pradesh\b/i, "Arunachal Pradesh"],
  [/\bChhattisgarh\b/i, "Chhattisgarh"],
  [/\bHimachal Pradesh\b/i, "Himachal Pradesh"],
  [/\bMadhya Pradesh\b/i, "Madhya Pradesh"],
  [/\bUttar Pradesh\b/i, "Uttar Pradesh"],
  [/\bWest Bengal\b/i, "West Bengal"],
  [/\bTamilnadu\b|\bTamil Nadu\b/i, "Tamil Nadu"],
  [/\bPuducherry\b/i, "Puducherry (U.T.)"],
  [/\bUttarakhand\b/i, "Uttarakhand"],
  [/\bMeghalaya\b/i, "Meghalaya"],
  [/\bMaharashtra\b/i, "Maharashtra"],
  [/\bKarnataka\b/i, "Karnataka"],
  [/\bRajasthan\b/i, "Rajasthan"],
  [/\bJharkhand\b/i, "Jharkhand"],
  [/\bU\.T\.?\s*of\s*Ladakh\b|\bLadakh\b/i, "Ladakh (U.T.)"],
  [/\bU\.T\.?\s*of\s*Jammu\s*&\s*Kashmir\b/i, "Jammu & Kashmir (U.T.)"],
  [/\bMizoram\b/i, "Mizoram"],
  [/\bNagaland\b/i, "Nagaland"],
  [/\bTelangana\b/i, "Telangana"],
  [/\bTripura\b/i, "Tripura"],
  [/\bOdisha\b/i, "Odisha"],
  [/\bPunjab\b/i, "Punjab"],
  [/\bSikkim\b/i, "Sikkim"],
  [/\bManipur\b/i, "Manipur"],
  [/\bKerala\b/i, "Kerala"],
  [/\bGujarat\b/i, "Gujarat"],
  [/\bHaryana\b/i, "Haryana"],
  [/\bAssam\b/i, "Assam"],
  [/\bBihar\b/i, "Bihar"],
  [/\bGoa\b/i, "Goa"],
];

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findState(text) {
  for (const [pattern, state] of stateAliases) {
    if (pattern.test(text)) return state;
  }
  return null;
}

function isIgnorableLine(line) {
  const value = clean(line);
  return !value ||
    /^Sl\.\s*No\.?\b/i.test(value) ||
    /^Name of (?:the )?Monument/i.test(value) ||
    /^List of Centrally Protected/i.test(value) ||
    /^Map indicating Circles/i.test(value) ||
    /^Centrally Protected Monuments\/Sites:/i.test(value) ||
    /^Centrally Protected Monuments\/Sites\s+:/i.test(value) ||
    /^\d{1,3}$/.test(value) ||
    /^TOTAL\b/i.test(value) ||
    /^---END OF LIST---$/i.test(value) ||
    /^(?:\(?U\.?T\.?\)?|Circle Name|State Covered)$/i.test(value);
}

function slugify(value) {
  const plain = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return plain.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
}

function stableSlug(row) {
  const key = [row.name, row.locality, row.district, row.state].map((part) => clean(part).toLocaleLowerCase()).join("\u001f");
  const suffix = createHash("sha256").update(key).digest("hex").slice(0, 10);
  return `asi-${slugify(key).slice(0, 170)}-${suffix}`;
}

function parseAsiPdf(sourcePath) {
  const extraction = spawnSync("pdftotext", ["-layout", "-enc", "UTF-8", sourcePath, "-"], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    windowsHide: true,
  });
  if (extraction.error || extraction.status !== 0 || !extraction.stdout) {
    const detail = extraction.error?.message || extraction.stderr || "no text was extracted";
    throw new Error(`Could not read the ASI PDF with pdftotext: ${detail}`);
  }

  const lines = extraction.stdout.replace(/\f/g, "\n").split(/\r?\n/);
  const accepted = [];
  const incomplete = [];
  const seen = new Set();
  const states = new Set();
  const detectedStates = new Set();
  let currentState = null;
  let inTable = false;
  let columns = null;
  let pending = null;
  let duplicateCount = 0;

  function finishPending() {
    if (!pending) return;
    if (pending.wrapped || !pending.name || !pending.locality || !pending.district || !pending.state) {
      incomplete.push({ state: pending.state, row: pending.rowNumber });
      pending = null;
      return;
    }
    const row = {
      name: clean(pending.name),
      locality: clean(pending.locality),
      district: clean(pending.district),
      state: clean(pending.state),
    };
    if ([row.name, row.locality, row.district, row.state].some((part) => !part || part.length > 300)) {
      incomplete.push({ state: row.state, row: pending.rowNumber });
      pending = null;
      return;
    }
    const key = [row.name, row.locality, row.district, row.state].map((part) => part.toLocaleLowerCase()).join("\u001f");
    if (seen.has(key)) duplicateCount += 1;
    else {
      seen.add(key);
      row.slug = stableSlug(row);
      row.description = "A centrally protected site listed in the Archaeological Survey of India catalogue. Detailed historical information is not included in the imported source.";
      row.history = NOT_RECORDED;
      row.cultural_significance = NOT_RECORDED;
      row.architecture = NOT_RECORDED;
      row.historical_period = NOT_RECORDED;
      row.address = null;
      accepted.push(row);
      states.add(row.state);
    }
    pending = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingText = lines.slice(index, index + 3).join(" ");
    const heading = /List of Centrally\s+Protected\s+Monuments(?:\s*\/\s*Sites)?\s+under\s+(?:the\s+)?jurisdiction of/i.test(headingText);
    if (heading) {
      finishPending();
      currentState = findState(lines.slice(index, index + 5).join(" "));
      if (currentState) detectedStates.add(currentState);
      inTable = false;
      columns = null;
      continue;
    }

    if (currentState && /Sl\.\s*No\./i.test(line) && /Locality/i.test(line) && /District/i.test(line)) {
      const localityIndex = line.indexOf("Locality");
      const districtIndex = line.indexOf("District");
      if (localityIndex > 0 && districtIndex > localityIndex) {
        columns = { localityIndex, districtIndex };
        inTable = true;
      }
      continue;
    }

    if (!currentState || !inTable || !columns) continue;
    const rowMatch = /^\s*(\d{1,4})\.\s*/.exec(line);
    if (rowMatch) {
      finishPending();
      const name = clean(line.slice(0, columns.localityIndex).replace(/^\s*\d{1,4}\.\s*/, ""));
      let locality = clean(line.slice(columns.localityIndex, columns.districtIndex));
      let district = clean(line.slice(columns.districtIndex));
      let rowName = name;
      // Some ASI sections use narrower row columns than their repeated header.
      // If the fixed-position district is blank, recover only clear 2+ space
      // column groups, keeping all title groups together and taking the final
      // two groups as locality and district.
      if (!district) {
        const groups = line.trim().split(/\s{2,}/).map(clean).filter(Boolean);
        if (groups.length >= 3) {
          rowName = clean(groups.slice(0, -2).join(" ")).replace(/^\d{1,4}\.\s*/, "");
          locality = groups.at(-2);
          district = groups.at(-1);
        }
      }
      pending = { state: currentState, rowNumber: Number(rowMatch[1]), name: rowName, locality, district, wrapped: false };
      continue;
    }

    if (pending && !isIgnorableLine(line)) pending.wrapped = true;
  }
  finishPending();

  const slugs = new Set(accepted.map((row) => row.slug));
  if (slugs.size !== accepted.length) throw new Error("Stable slug validation found a collision.");
  if (accepted.length < MIN_RECORDS) {
    throw new Error(`Only ${accepted.length} complete single-line records were extracted; refusing to import fewer than ${MIN_RECORDS}.`);
  }

  return { records: accepted, incompleteCount: incomplete.length, duplicateCount, states: [...states].sort(), detectedStates: [...detectedStates].sort() };
}

async function applyRecords(records) {
  const pool = require("../config/db");
  const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (process.env.NODE_ENV === "production" || !localDatabaseHosts.has(String(pool.options.host))) {
    await pool.end();
    throw new Error("ASI apply is limited to a local non-production PostgreSQL database; dry-run remains available.");
  }
  const client = await pool.connect();
  const accessedOn = new Date().toISOString().slice(0, 10);
  const sourceNote = "Imported from a complete single-line row in the official ASI state-wise and circle-wise list. The source supports this title and locality as a centrally protected site; additional historical claims, coordinates, images, and visiting information were not supplied.";
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO heritage_categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING",
      [CATEGORY_NAME, CATEGORY_SLUG],
    );
    const category = await client.query("SELECT id FROM heritage_categories WHERE slug = $1", [CATEGORY_SLUG]);
    if (!category.rows.length) throw new Error("The ASI category could not be prepared.");
    const payload = JSON.stringify(records);
    const inserted = await client.query(
      `WITH imported AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(
           name TEXT, slug TEXT, description TEXT, history TEXT,
           cultural_significance TEXT, architecture TEXT, historical_period TEXT,
           state TEXT, district TEXT, locality TEXT, address TEXT
         )
       )
       INSERT INTO heritage (
         name, slug, description, history, cultural_significance, architecture,
         historical_period, category_id, state, district, locality, address, publication_status
       )
       SELECT name,slug,description,history,cultural_significance,architecture,
              historical_period,$2,state,district,locality,address,'published'
       FROM imported
       ON CONFLICT (slug) DO NOTHING
       RETURNING id, slug`,
      [payload, category.rows[0].id],
    );

    await client.query(
      `WITH imported AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(
           name TEXT, slug TEXT, state TEXT, district TEXT, locality TEXT
         )
       )
       INSERT INTO heritage_sources (
         heritage_id,source_name,source_title,publisher,source_url,source_note,accessed_on,claims_supported
       )
       SELECT h.id,$2,$3,$4,$5,$6,$7,ARRAY['name','location','protected_status','description']::TEXT[]
       FROM imported i
       JOIN heritage h ON h.slug=i.slug AND h.name=i.name AND h.state=i.state
         AND h.district=i.district AND h.locality=i.locality
       ON CONFLICT (heritage_id,source_url) DO NOTHING`,
      [payload, PUBLISHER, SOURCE_TITLE, PUBLISHER, SOURCE_URL, sourceNote, accessedOn],
    );
    const sources = await client.query(
      "SELECT COUNT(*)::INTEGER AS total FROM heritage_sources WHERE source_url=$1 AND publisher=$2",
      [SOURCE_URL, PUBLISHER],
    );
    await client.query("COMMIT");
    return { inserted: inserted.rowCount, source_rows_after_import: sources.rows[0].total };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function readArguments(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--apply") options.apply = true;
    else if (argv[index] === "--help") options.help = true;
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  return options;
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node backend/database/import-asi.js [--apply]");
    console.log("Default is validation and dry-run only. --apply uses additive inserts and never overwrites existing heritage rows.");
    return;
  }
  const fs = require("node:fs");
  if (!fs.existsSync(DEFAULT_SOURCE)) throw new Error(`ASI PDF not found: ${DEFAULT_SOURCE}`);
  const parsed = parseAsiPdf(DEFAULT_SOURCE);
  const summary = {
    mode: options.apply ? "apply" : "dry-run",
    source: SOURCE_URL,
    complete_distinct_records: parsed.records.length,
    rejected_incomplete_rows: parsed.incompleteCount,
    duplicate_rows_skipped: parsed.duplicateCount,
    states_or_territories: parsed.states,
    detected_section_states: parsed.detectedStates,
    preview: parsed.records.slice(0, 5).map(({ name, locality, district, state }) => ({ name, locality, district, state })),
  };
  if (options.apply) {
    summary.database = await applyRecords(parsed.records);
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`ASI import stopped safely: ${error.message}`);
  process.exitCode = 1;
});
