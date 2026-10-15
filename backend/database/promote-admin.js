"use strict";

const pool = require("../config/db");

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return null;
  return process.argv[index + 1];
}

function databaseHost() {
  if (process.env.DATABASE_URL) {
    try { return new URL(process.env.DATABASE_URL).hostname.toLowerCase().replace(/^\[|\]$/g, ""); }
    catch { return "invalid"; }
  }
  return (process.env.DB_HOST || "localhost").toLowerCase().replace(/^\[|\]$/g, "");
}

function printHelp() {
  console.log(`Promote one active, existing account after out-of-band identity verification.

Usage:
  node backend/database/promote-admin.js --user-id <id> --email <exact-email> --identity-verified --operator <name> --confirm PROMOTE

For a non-loopback database, also pass --allow-external-database explicitly.
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
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isProductionTarget = process.env.NODE_ENV === "production" || !localHosts.has(databaseHost());
  const externalOptIn = process.argv.includes("--allow-external-database");

  if (!Number.isSafeInteger(userId) || userId < 1 || !email || !operator || !explicitlyConfirmed || confirmed !== "PROMOTE") {
    printHelp();
    throw new Error("A valid ID, exact email, verified-identity flag, operator name, and explicit PROMOTE confirmation are required.");
  }
  if (isProductionTarget && !externalOptIn) {
    throw new Error("This database is not a confirmed local loopback target. Recheck the database and pass --allow-external-database only in a controlled maintenance session.");
  }

  const client = await pool.connect();
  let transactionOpen = false;
  try {
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

main().catch((error) => {
  console.error("Administrator provisioning failed:", error.message || error.code || "unknown error");
  process.exitCode = 1;
});
