#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../config/db");
const { runDryRun } = require("./coordinate-enrichment");

function positiveInteger(value, name, maximum) {
  if (!/^\d+$/.test(String(value ?? ""))) throw new Error(`${name} must be a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`${name} must be between 1 and ${maximum}`);
  return number;
}

function parseArguments(args) {
  const options = { apply: false, state: "Maharashtra", limit: 20, delayMs: 1000, timeoutMs: 12000, output: null, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--dry-run") options.apply = false;
    else if (flag === "--apply") options.apply = true;
    else if (flag === "--help") options.help = true;
    else if (["--state", "--limit", "--delay-ms", "--timeout-ms", "--output"].includes(flag)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
      index += 1;
      if (flag === "--state") options.state = value.trim() || null;
      if (flag === "--limit") options.limit = positiveInteger(value, flag, 50);
      if (flag === "--delay-ms") options.delayMs = positiveInteger(value, flag, 60000);
      if (flag === "--timeout-ms") options.timeoutMs = positiveInteger(value, flag, 60000);
      if (flag === "--output") options.output = path.resolve(value);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (options.delayMs < 1000) throw new Error("--delay-ms must be at least 1000 ms");
  if (options.timeoutMs < 1000) throw new Error("--timeout-ms must be at least 1000 ms");
  return options;
}

function usage() {
  return [
    "Usage: node backend/database/suggest-coordinates.js [--dry-run] [options]",
    "Discovery is always read-only. Maharashtra and a 20-site sample are the defaults; maximum sample is 50.",
    "Options: --state Maharashtra | --limit 20 | --delay-ms 1000 | --timeout-ms 12000 | --output <new-report.json> | --help",
    "After reviewing a report, set review_status=approved, review_confidence>=0.95, reviewed_by, and reviewed_on, then run: node backend/database/enrich-coordinates.js <dry-run-report.json> --apply",
  ].join("\n");
}

async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArguments(args);
    if (options.help) { console.log(usage()); return null; }
    const report = await runDryRun(options, pool);
    const json = JSON.stringify(report, null, 2);
    if (options.output) {
      fs.mkdirSync(path.dirname(options.output), { recursive: true });
      fs.writeFileSync(options.output, `${json}\n`, { encoding: "utf8", flag: "wx" });
      console.log(JSON.stringify({ report: options.output, mode: report.mode, database_mutated: false, sites_sampled: report.sites_sampled, summary: report.summary }, null, 2));
    } else console.log(json);
    return report;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Coordinate discovery failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArguments, positiveInteger, usage };
