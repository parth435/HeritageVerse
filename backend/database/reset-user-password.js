"use strict";

const bcrypt = require("bcrypt");
const { createDatabasePoolOptions } = require("../config/database-options");
const { normalizeEmail, selectUniqueAccount } = require("../modules/auth-identity");

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const ADMIN_MUTATION_LOCK = [1246350413, 1];

class ResetError extends Error {}

function parseArguments(argv) {
  const values = new Map();
  const flags = new Set(["--identity-verified", "--allow-external-database", "--help", "-h"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (flags.has(key)) {
      if (values.has(key)) throw new ResetError(`Duplicate option: ${key}`);
      values.set(key, true);
      continue;
    }
    if (!key.startsWith("--") || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new ResetError(`Invalid or incomplete option: ${key}`);
    }
    if (values.has(key)) throw new ResetError(`Duplicate option: ${key}`);
    values.set(key, argv[index + 1]);
    index += 1;
  }
  return values;
}

function validateOptions(values) {
  const userId = Number(values.get("--user-id"));
  const email = normalizeEmail(values.get("--email"));
  const operator = typeof values.get("--operator") === "string" ? values.get("--operator").trim().slice(0, 120) : "";
  const expectedHost = typeof values.get("--expected-host") === "string" ? values.get("--expected-host").trim().toLowerCase() : "";
  const expectedDatabase = typeof values.get("--expected-database") === "string" ? values.get("--expected-database").trim() : "";
  const confirmed = values.get("--confirm") === "RESET-PASSWORD";

  if (!Number.isSafeInteger(userId) || userId < 1 || !email || Buffer.byteLength(email, "utf8") > 254 || !/^\S+@\S+\.\S+$/.test(email) || !operator || !expectedHost || !expectedDatabase) {
    throw new ResetError("A positive user ID, exact email, operator, expected database host, and expected database name are required.");
  }
  if (!values.has("--identity-verified") || !confirmed || !values.has("--allow-external-database")) {
    throw new ResetError("Out-of-band identity verification, --confirm RESET-PASSWORD, and --allow-external-database are required.");
  }
  if (!/^[a-z0-9.-]+$/.test(expectedHost) || !/^[a-zA-Z0-9_-]+$/.test(expectedDatabase)) {
    throw new ResetError("Expected database host and name must be plain identifiers, not URLs or connection strings.");
  }
  const allowedOptions = new Set([
    "--user-id", "--email", "--operator", "--expected-host", "--expected-database", "--confirm",
    "--identity-verified", "--allow-external-database", "--help", "-h",
  ]);
  for (const key of values.keys()) {
    if (!allowedOptions.has(key)) throw new ResetError(`Unsupported option: ${key}`);
  }
  return { userId, email, operator, expectedHost, expectedDatabase };
}

function parseDatabaseTarget(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new ResetError("DATABASE_URL is not a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol.toLowerCase()) || !url.hostname || url.pathname.length < 2) {
    throw new ResetError("DATABASE_URL must identify a PostgreSQL host and database.");
  }
  let database;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new ResetError("DATABASE_URL contains an invalid database name.");
  }
  return { host: url.hostname.replace(/^\[|\]$/g, "").toLowerCase(), database };
}

function validateDatabaseTarget(connectionString, expectedHost, expectedDatabase) {
  const target = parseDatabaseTarget(connectionString);
  if (target.host === "localhost" || target.host === "127.0.0.1" || target.host === "::1") {
    throw new ResetError("Password reset is refused for loopback database targets.");
  }
  if (target.host !== expectedHost.toLowerCase()) {
    throw new ResetError("DATABASE_URL host does not match the explicitly confirmed --expected-host.");
  }
  if (target.database !== expectedDatabase) {
    throw new ResetError("DATABASE_URL database does not match the explicitly confirmed --expected-database.");
  }
  return target;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new ResetError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters and no more than ${MAX_PASSWORD_BYTES} UTF-8 bytes.`);
  }
}

function assertResetTargetAccount(rows, options) {
  const user = selectUniqueAccount(rows);
  if (!user || Number(user.id) !== options.userId) {
    throw new ResetError("The exact email must resolve to exactly the specified existing account; no change was made.");
  }
  if (!["user", "admin"].includes(String(user.role).toLowerCase()) || String(user.status).toUpperCase() !== "ACTIVE") {
    throw new ResetError("The specified account must be an active user or administrator; no change was made.");
  }
  return user;
}

async function verifyResetTarget(pool, options) {
  const lookup = await pool.query(
    `SELECT id, email, COALESCE(to_jsonb(users) ->> 'role', 'user') AS role,
            COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE') AS status
       FROM users
      WHERE LOWER(BTRIM(email)) = $1
      ORDER BY id ASC LIMIT 2`,
    [options.email],
  );
  return assertResetTargetAccount(lookup.rows, options);
}

function printHelp() {
  process.stdout.write(`Reset the password for one existing active user or administrator after out-of-band identity verification.\n\nUsage:\n  node backend/database/reset-user-password.js --user-id <id> --email <exact-email> --identity-verified --operator <name> --expected-host <database-host> --expected-database <database-name> --allow-external-database --confirm RESET-PASSWORD\n\nThe command requires NODE_ENV=production and DATABASE_URL from the approved secret store. It never reads backend/.env, creates users, changes roles, or prints the password/hash.\n`);
}

function readHidden(prompt) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new ResetError("A secure interactive terminal is required to enter the password."));
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = Boolean(input.isRaw);
    const cleanup = () => {
      input.removeListener("data", onData);
      try { input.setRawMode(wasRaw); } catch { /* Keep cleanup safe when stdin is closing. */ }
      input.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003" || character === "\u0004") {
          cleanup();
          reject(new ResetError("Password entry cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character === "\u0015") {
          value = "";
        } else if (character >= " ") {
          value += character;
        }
      }
    };

    process.stdout.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function resetAccountPassword(pool, options, passwordHash) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    const database = await client.query("SELECT current_database() AS name");
    if (database.rows[0]?.name !== options.expectedDatabase) {
      throw new ResetError("Connected database does not match the explicitly confirmed --expected-database.");
    }

    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", ADMIN_MUTATION_LOCK);

    const lookup = await client.query(
      `SELECT id, email, COALESCE(to_jsonb(users) ->> 'role', 'user') AS role,
              COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE') AS status
         FROM users
        WHERE LOWER(BTRIM(email)) = $1
        ORDER BY id ASC LIMIT 2 FOR UPDATE`,
      [options.email],
    );
    const user = assertResetTargetAccount(lookup.rows, options);
    const targetRole = String(user.role).toLowerCase();

    const updated = await client.query(
      `UPDATE users SET password_hash = $1
        WHERE id = $2 AND LOWER(BTRIM(email)) = $3 AND role = $4
          AND COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE') = 'ACTIVE'
        RETURNING id, role`,
      [passwordHash, options.userId, options.email, targetRole],
    );
    if (updated.rows.length !== 1 || String(updated.rows[0].role).toLowerCase() !== targetRole) {
      throw new ResetError("Password reset did not update exactly one account while preserving its role.");
    }

    await client.query(
      "INSERT INTO activity_logs (title, entity_type, entity_id, user_id) VALUES ($1, 'user', $2, NULL)",
      [`Password reset by ${options.operator} after out-of-band identity verification`, options.userId],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return updated.rows[0].id;
  } catch (error) {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args.has("--help") || args.has("-h")) {
    printHelp();
    return;
  }
  if (process.env.NODE_ENV !== "production") throw new ResetError("Set NODE_ENV=production in the approved maintenance session.");
  if (!process.env.DATABASE_URL) throw new ResetError("DATABASE_URL must be injected from the approved secret store; this utility does not load local environment files.");

  const options = validateOptions(args);
  const target = validateDatabaseTarget(process.env.DATABASE_URL, options.expectedHost, options.expectedDatabase);
  const { Pool } = require("pg");
  const pool = new Pool(createDatabasePoolOptions(process.env));
  let password = "";
  let confirmation = "";
  let passwordHash = "";
  try {
    const connected = await pool.query("SELECT current_database() AS name");
    if (connected.rows[0]?.name !== options.expectedDatabase) {
      throw new ResetError("Connected database does not match the explicitly confirmed --expected-database.");
    }
    await verifyResetTarget(pool, options);

    process.stdout.write(`Target verified: ${target.database} at ${target.host}.\n`);
    password = await readHidden("New password (input hidden): ");
    confirmation = await readHidden("Repeat new password (input hidden): ");
    if (password !== confirmation) throw new ResetError("The entered passwords do not match; no change was made.");
    validatePassword(password);
    passwordHash = await bcrypt.hash(password, 10);
    password = "";
    confirmation = "";

    const userId = await resetAccountPassword(pool, options, passwordHash);
    passwordHash = "";
    process.stdout.write(`Password reset completed for account ID ${userId}. The account role was preserved.\n`);
  } finally {
    password = "";
    confirmation = "";
    passwordHash = "";
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const safeMessage = error instanceof ResetError ? error.message : error?.code ? `database error ${error.code}` : "unexpected failure";
    console.error("Administrator password reset failed:", safeMessage);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArguments,
  validateOptions,
  parseDatabaseTarget,
  validateDatabaseTarget,
  validatePassword,
  assertResetTargetAccount,
  verifyResetTarget,
  resetAccountPassword,
};
