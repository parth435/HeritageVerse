#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../config/db");

const migrationsDirectory = path.resolve(__dirname, "migrations");
const filename = process.argv[2];
const apply = process.argv[3] === "--apply";
const resolved = filename ? path.resolve(migrationsDirectory, filename) : "";
const isInsideMigrations = resolved.startsWith(`${migrationsDirectory}${path.sep}`);
const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(String(pool.options.host));

async function main() {
  try {
    if (!apply || !isInsideMigrations || path.basename(resolved) !== filename) {
      throw new Error("Usage: node backend/database/apply-migration.js <migration-file.sql> --apply");
    }
    if (process.env.NODE_ENV === "production" || !isLocalDatabase) {
      throw new Error("This helper only applies migrations to a local non-production PostgreSQL database.");
    }
    if (!fs.existsSync(resolved) || path.extname(resolved) !== ".sql") {
      throw new Error("The requested SQL migration does not exist.");
    }

    const sql = fs.readFileSync(resolved, "utf8");
    await pool.query(sql);
    console.log(`Applied ${path.basename(resolved)} to the configured local PostgreSQL database.`);
  } catch (error) {
    console.error(`Migration not applied: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
