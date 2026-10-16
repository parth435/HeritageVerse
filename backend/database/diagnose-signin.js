"use strict";

const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const { createDatabasePoolOptions } = require("../config/database-options");
const { NORMALIZED_EMAIL_PREDICATE, normalizeEmail, selectUniqueAccount } = require("../modules/auth-identity");
const { parseDatabaseTarget, validateDatabaseTarget } = require("./reset-user-password");

class DiagnosticError extends Error {}

function parseArguments(argv) {
  const values = new Map();
  const flags = new Set(["--identity-verified", "--help", "-h"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (flags.has(key)) {
      if (values.has(key)) throw new DiagnosticError(`Duplicate option: ${key}`);
      values.set(key, true);
      continue;
    }
    if (!key.startsWith("--") || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new DiagnosticError(`Invalid or incomplete option: ${key}`);
    }
    if (values.has(key)) throw new DiagnosticError(`Duplicate option: ${key}`);
    values.set(key, argv[index + 1]);
    index += 1;
  }
  return values;
}

function validateOptions(values) {
  const allowedOptions = new Set([
    "--user-id", "--email", "--expected-host", "--expected-database", "--confirm",
    "--identity-verified", "--help", "-h",
  ]);
  for (const key of values.keys()) {
    if (!allowedOptions.has(key)) throw new DiagnosticError(`Unsupported option: ${key}`);
  }

  const userId = Number(values.get("--user-id"));
  const email = normalizeEmail(values.get("--email"));
  const expectedHost = typeof values.get("--expected-host") === "string" ? values.get("--expected-host").trim().toLowerCase() : "";
  const expectedDatabase = typeof values.get("--expected-database") === "string" ? values.get("--expected-database").trim() : "";
  if (!Number.isSafeInteger(userId) || userId < 1 || !email || Buffer.byteLength(email, "utf8") > 254 || !/^\S+@\S+\.\S+$/.test(email) || !expectedHost || !expectedDatabase) {
    throw new DiagnosticError("A positive user ID, exact email, expected database host, and expected database name are required.");
  }
  if (!values.has("--identity-verified") || values.get("--confirm") !== "CHECK-SIGNIN") {
    throw new DiagnosticError("Out-of-band identity verification and --confirm CHECK-SIGNIN are required.");
  }
  return { userId, email, expectedHost, expectedDatabase };
}

function classifyAccount(rows, options) {
  if (!Array.isArray(rows) || rows.length === 0) return { category: "account_not_found" };
  if (rows.length !== 1) return { category: "account_ambiguous" };
  const user = selectUniqueAccount(rows);
  if (!user || Number(user.id) !== options.userId) return { category: "account_id_mismatch" };
  if (normalizeEmail(user.email) !== options.email) return { category: "account_email_mismatch" };
  return { category: "account_found", user };
}

async function classifyPassword(password, user) {
  if (typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 72) {
    return { category: "password_input_rejected_by_signin" };
  }
  if (typeof user.password_hash !== "string" || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(user.password_hash)) {
    return { category: "stored_hash_unusable" };
  }

  let matches;
  try {
    matches = await bcrypt.compare(password, user.password_hash);
  } catch {
    return { category: "stored_hash_unusable" };
  }
  if (!matches) return { category: "password_mismatch" };

  const role = String(user.role || "user").toLowerCase();
  const status = String(user.status || "ACTIVE").toUpperCase();
  if (status !== "ACTIVE") return { category: "credentials_valid_account_inactive", role, status };
  if (role !== "admin") return { category: "credentials_valid_non_admin", role, status };
  return { category: "credentials_valid_admin", role, status };
}

async function diagnoseSignIn(pool, options, password) {
  const connected = await pool.query("SELECT current_database() AS name");
  if (connected.rows[0]?.name !== options.expectedDatabase) {
    throw new DiagnosticError("Connected database does not match the explicitly confirmed expected database.");
  }

  const result = await pool.query(
    `SELECT id, email, password_hash,
            COALESCE(to_jsonb(users) ->> 'role', 'user') AS role,
            COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE') AS status
       FROM users WHERE ${NORMALIZED_EMAIL_PREDICATE}
       ORDER BY id ASC LIMIT 2`,
    [options.email],
  );
  const account = classifyAccount(result.rows, options);
  if (account.category !== "account_found") return { category: account.category };
  return classifyPassword(password, account.user);
}

function printHelp() {
  process.stdout.write(`Read-only sign-in diagnostic for one verified account.\n\nUsage:\n  node backend/database/diagnose-signin.js --user-id <id> --email <exact-email> --identity-verified --expected-host <database-host> --expected-database <database-name> --confirm CHECK-SIGNIN\n\nRequires NODE_ENV=production and DATABASE_URL from the approved secret store. The password is requested through a hidden TTY prompt. The command never reads backend/.env, prints the email/hash/password/connection URL, or changes data.\n`);
}

function readHidden(prompt) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new DiagnosticError("A secure interactive terminal is required to enter the password."));
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
          reject(new DiagnosticError("Password entry cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") value = Array.from(value).slice(0, -1).join("");
        else if (character === "\u0015") value = "";
        else if (character >= " ") value += character;
      }
    };

    process.stdout.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args.has("--help") || args.has("-h")) {
    printHelp();
    return;
  }
  if (process.env.NODE_ENV !== "production") throw new DiagnosticError("Run this diagnostic only in the controlled production maintenance shell.");
  if (!process.env.DATABASE_URL) throw new DiagnosticError("DATABASE_URL must be injected from the approved secret store; this utility does not load local environment files.");

  const options = validateOptions(args);
  validateDatabaseTarget(process.env.DATABASE_URL, options.expectedHost, options.expectedDatabase);
  const pool = new Pool(createDatabasePoolOptions(process.env));
  let password = "";
  try {
    const connected = await pool.query("SELECT current_database() AS name");
    if (connected.rows[0]?.name !== options.expectedDatabase) {
      throw new DiagnosticError("Connected database does not match the explicitly confirmed expected database.");
    }
    process.stdout.write("Database target matches the explicitly confirmed host and database.\n");
    password = await readHidden("Enter the password attempted on the site (input hidden): ");
    const result = await diagnoseSignIn(pool, options, password);
    process.stdout.write(`Sign-in diagnostic: category=${result.category}${result.role ? ` role=${result.role}` : ""}${result.status ? ` status=${result.status}` : ""}\n`);
    if (result.category === "password_mismatch") {
      process.stdout.write("The attempted password does not match this account's hash in the verified database. Use the guarded reset utility only after identity verification.\n");
    }
  } finally {
    password = "";
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const safeMessage = error instanceof DiagnosticError ? error.message : error?.code ? `database error ${error.code}` : "unexpected diagnostic failure";
    console.error("Sign-in diagnostic failed:", safeMessage);
    process.exitCode = 1;
  });
}

module.exports = { parseArguments, validateOptions, classifyAccount, classifyPassword, diagnoseSignIn };
