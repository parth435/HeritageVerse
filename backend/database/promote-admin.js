"use strict";

const { Pool } = require("pg");
const { createDatabasePoolOptions } = require("../config/database-options");

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return null;
  return process.argv[index + 1];
}

function parseDatabaseTarget(connectionString, legacyHost = "localhost", legacyDatabase = "") {
  if (!connectionString) {
    return {
      host: String(legacyHost || "localhost").toLowerCase().replace(/^\[|\]$/g, ""),
      database: String(legacyDatabase || ""),
    };
  }
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol.toLowerCase()) || !url.hostname || url.pathname.length < 2) {
      return { host: "invalid", database: "" };
    }
    return {
      host: url.hostname.toLowerCase().replace(/^\[|\]$/g, ""),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
  } catch {
    return { host: "invalid", database: "" };
  }
}

function validateDatabaseTarget({ target, nodeEnvironment, externalOptIn, expectedHost, expectedDatabase }) {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocal = localHosts.has(target.host);
  if (nodeEnvironment === "production" && isLocal) {
    throw new Error("Production administrator provisioning must not target a loopback database.");
  }
  if (!isLocal || nodeEnvironment === "production") {
    if (!externalOptIn) {
      throw new Error("This database is not a confirmed local loopback target. Recheck the database and pass --allow-external-database only in a controlled maintenance session.");
    }
    if (!expectedHost || !expectedDatabase) {
      throw new Error("Remote administrator provisioning requires --expected-host and --expected-database.");
    }
    if (target.host !== expectedHost.toLowerCase()) {
      throw new Error("DATABASE_URL host does not match the explicitly confirmed --expected-host.");
    }
    if (target.database !== expectedDatabase) {
      throw new Error("DATABASE_URL database does not match the explicitly confirmed --expected-database.");
    }
  }
}

function printHelp() {
  console.log(`Promote one active, existing account after out-of-band identity verification.

Usage:
  node backend/database/promote-admin.js --user-id <id> --email <exact-email> --identity-verified --operator <name> --confirm PROMOTE

For a non-loopback database, also pass --allow-external-database --expected-host <host> --expected-database <name>.
The command does not create accounts, set passwords, or edit other user data.
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const userId = Number(argument("--user-id"));
  const email = argument("--email")?.trim().toLowerCase();
  const operator = argument("--operator")?.trim().slice(0, 120);
  const explicitlyConfirmed = process.argv.includes("--identity-verified");
  const confirmed = argument("--confirm");
  const externalOptIn = process.argv.includes("--allow-external-database");
  const expectedHost = argument("--expected-host")?.trim().toLowerCase();
  const expectedDatabase = argument("--expected-database")?.trim();

  if (!Number.isSafeInteger(userId) || userId < 1 || !email || !operator || !explicitlyConfirmed || confirmed !== "PROMOTE") {
    printHelp();
    throw new Error("A valid ID, exact email, verified-identity flag, operator name, and explicit PROMOTE confirmation are required.");
  }
  const target = parseDatabaseTarget(process.env.DATABASE_URL, process.env.DB_HOST, process.env.DB_NAME);
  validateDatabaseTarget({ target, nodeEnvironment: process.env.NODE_ENV, externalOptIn, expectedHost, expectedDatabase });

  const pool = new Pool(createDatabasePoolOptions(process.env));
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    if (expectedDatabase) {
      const database = await client.query("SELECT current_database() AS name");
      if (database.rows[0]?.name !== expectedDatabase) {
        throw new Error("Connected database does not match the explicitly confirmed --expected-database.");
      }
    }
    await client.query("BEGIN");
    transactionOpen = true;
    // Use the same lock as admin API mutations so provisioning serializes with
    // concurrent role/status changes and keeps the account check current.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [1246350413, 1]);
    const lookup = await client.query(
      `SELECT id, name, email, COALESCE(to_jsonb(users) ->> 'role', 'user') AS role,
              COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE') AS status
         FROM users WHERE id=$1 AND lower(email)=$2 FOR UPDATE`,
      [userId, email],
    );
    const target = lookup.rows[0];
    if (!target) throw new Error("No matching user was found for that ID and exact email.");
    if (target.role !== "user") throw new Error("The matching account is not an ordinary user; no change was made.");
    if (target.status !== "ACTIVE") throw new Error("The matching account is not active; no change was made.");

    const updated = await client.query(
      `UPDATE users SET role='admin'
        WHERE id=$1 AND lower(email)=$2 AND role='user'
          AND COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE')='ACTIVE'
        RETURNING id, name, email, role`,
      [userId, email],
    );
    if (updated.rows.length !== 1) throw new Error("Promotion did not update exactly one active account.");

    await client.query(
      "INSERT INTO activity_logs (title, entity_type, entity_id, user_id) VALUES ($1, 'user', $2, NULL)",
      [`Initial administrator provisioned by ${operator} after out-of-band identity verification`, userId],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    console.log(`Promoted user ${updated.rows[0].id} (${updated.rows[0].email}) to admin; recorded the bootstrap operator in activity_logs.`);
  } catch (error) {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* Keep the original error. */ }
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Administrator provisioning failed:", error.message || error.code || "unknown error");
    process.exitCode = 1;
  });
}

module.exports = { parseDatabaseTarget, validateDatabaseTarget };
