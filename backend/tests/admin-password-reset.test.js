"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcrypt");
const {
  parseArguments,
  validateOptions,
  parseDatabaseTarget,
  validateDatabaseTarget,
  validatePassword,
  resetAccountPassword,
} = require("../database/reset-user-password");

const safeArgs = [
  "--user-id", "1",
  "--email", " ParthBasarwadkar@gmail.com ",
  "--operator", "Verified Operator",
  "--expected-host", "ep-verified.us-east-2.aws.neon.tech",
  "--expected-database", "heritageversedb",
  "--identity-verified",
  "--allow-external-database",
  "--confirm", "RESET-PASSWORD",
];

test("password reset requires exact account, target, identity, and explicit confirmation", () => {
  const options = validateOptions(parseArguments(safeArgs));
  assert.deepEqual(options, {
    userId: 1,
    email: "parthbasarwadkar@gmail.com",
    operator: "Verified Operator",
    expectedHost: "ep-verified.us-east-2.aws.neon.tech",
    expectedDatabase: "heritageversedb",
  });

  for (const omitted of ["--identity-verified", "--allow-external-database", "--confirm"]) {
    const args = safeArgs.filter((value, index, all) => {
      if (value === omitted) return false;
      if (index > 0 && all[index - 1] === omitted) return false;
      return true;
    });
    assert.throws(() => validateOptions(parseArguments(args)));
  }
  assert.throws(() => validateOptions(parseArguments([...safeArgs, "--unexpected", "value"])), /Unsupported option/);
  assert.throws(() => parseArguments(["--user-id", "1", "--user-id", "2"]), /Duplicate option/);
});

test("database password reset pins both host and database and refuses loopback", () => {
  const connection = "postgresql://ep-verified.us-east-2.aws.neon.tech/heritageversedb?sslmode=require";
  assert.deepEqual(parseDatabaseTarget(connection), {
    host: "ep-verified.us-east-2.aws.neon.tech",
    database: "heritageversedb",
  });
  assert.equal(validateDatabaseTarget(connection, "ep-verified.us-east-2.aws.neon.tech", "heritageversedb").database, "heritageversedb");
  assert.throws(() => validateDatabaseTarget(connection, "other.us-east-2.aws.neon.tech", "heritageversedb"), /host does not match/);
  assert.throws(() => validateDatabaseTarget(connection, "ep-verified.us-east-2.aws.neon.tech", "staging"), /database does not match/);
  assert.throws(() => validateDatabaseTarget("postgres://localhost/heritageversedb", "localhost", "heritageversedb"), /loopback/);
});

test("password reset enforces the signup bcrypt input limits", () => {
  assert.doesNotThrow(() => validatePassword("correct horse battery"));
  assert.throws(() => validatePassword("short"), /at least 8 characters/);
  assert.throws(() => validatePassword("é".repeat(37)), /72 UTF-8 bytes/);
});

test("the reset hash uses signup's bcrypt cost and verifies only the supplied password", async () => {
  const password = "unit-test-only-reset-password";
  const hash = await bcrypt.hash(password, 10);
  assert.match(hash, /^\$2[aby]\$10\$/);
  assert.equal(await bcrypt.compare(password, hash), true);
  assert.equal(await bcrypt.compare("different-unit-test-password", hash), false);
});

function mockPool(userRows) {
  const calls = [];
  const client = {
    async query(statement, values = []) {
      calls.push({ statement: String(statement), values });
      if (String(statement).includes("SELECT current_database()")) return { rows: [{ name: "heritageversedb" }] };
      if (String(statement).includes("FROM users")) return { rows: userRows };
      if (String(statement).startsWith("UPDATE users SET password_hash")) return { rows: userRows.length === 1 ? [{ id: userRows[0].id, role: userRows[0].role }] : [] };
      return { rows: [] };
    },
    release() { calls.push({ statement: "RELEASE", values: [] }); },
  };
  return { calls, connect: async () => client };
}

test("password reset updates only the exact active regular account and audits without the hash", async () => {
  const pool = mockPool([{ id: 1, email: "parthbasarwadkar@gmail.com", role: "user", status: "ACTIVE" }]);
  const options = { userId: 1, email: "parthbasarwadkar@gmail.com", operator: "Verified Operator", expectedDatabase: "heritageversedb" };
  const passwordHash = "test-hash-placeholder";

  assert.equal(await resetAccountPassword(pool, options, passwordHash), 1);
  const update = pool.calls.find((call) => call.statement.startsWith("UPDATE users SET password_hash"));
  assert.deepEqual(update.values, [passwordHash, 1, "parthbasarwadkar@gmail.com", "user"]);
  assert.match(update.statement, /id = \$2 AND LOWER\(BTRIM\(email\)\) = \$3 AND role = \$4/);
  assert.match(update.statement, /status.*'ACTIVE'/s);
  const audit = pool.calls.find((call) => call.statement.startsWith("INSERT INTO activity_logs"));
  assert.ok(audit);
  assert.doesNotMatch(audit.statement + JSON.stringify(audit.values), /test-hash-placeholder/);
  assert.ok(pool.calls.some((call) => call.statement === "COMMIT"));
  assert.ok(!pool.calls.some((call) => call.statement.startsWith("UPDATE users SET role")));
});

test("password reset rolls back when the exact account does not resolve uniquely", async () => {
  const pool = mockPool([]);
  const options = { userId: 1, email: "parthbasarwadkar@gmail.com", operator: "Verified Operator", expectedDatabase: "heritageversedb" };

  await assert.rejects(resetAccountPassword(pool, options, "test-hash-placeholder"), /exact email must resolve/);
  assert.ok(pool.calls.some((call) => call.statement === "ROLLBACK"));
  assert.ok(!pool.calls.some((call) => call.statement.startsWith("UPDATE users SET password_hash")));
  assert.ok(!pool.calls.some((call) => call.statement.startsWith("INSERT INTO activity_logs")));
});

test("password reset refuses duplicate, inactive, elevated, and wrong-database targets", async () => {
  const options = { userId: 1, email: "parthbasarwadkar@gmail.com", operator: "Verified Operator", expectedDatabase: "heritageversedb" };
  const unsafeAccounts = [
    [
      { id: 1, email: "parthbasarwadkar@gmail.com", role: "user", status: "ACTIVE" },
      { id: 2, email: "PARTHBASARWADKAR@gmail.com", role: "user", status: "ACTIVE" },
    ],
    [{ id: 1, email: "parthbasarwadkar@gmail.com", role: "user", status: "SUSPENDED" }],
    [{ id: 1, email: "parthbasarwadkar@gmail.com", role: "owner", status: "ACTIVE" }],
  ];

  for (const rows of unsafeAccounts) {
    const pool = mockPool(rows);
    await assert.rejects(resetAccountPassword(pool, options, "test-hash-placeholder"));
    assert.ok(pool.calls.some((call) => call.statement === "ROLLBACK"));
    assert.ok(!pool.calls.some((call) => call.statement.startsWith("UPDATE users SET password_hash")));
  }

  const wrongDatabase = mockPool([{ id: 1, email: "parthbasarwadkar@gmail.com", role: "user", status: "ACTIVE" }]);
  await assert.rejects(resetAccountPassword(wrongDatabase, { ...options, expectedDatabase: "staging" }, "test-hash-placeholder"), /database does not match/);
  assert.ok(!wrongDatabase.calls.some((call) => call.statement.startsWith("BEGIN")));
});

test("password reset preserves the administrator role for the exact active account", async () => {
  const pool = mockPool([{ id: 1, email: "parthbasarwadkar@gmail.com", role: "admin", status: "ACTIVE" }]);
  const options = { userId: 1, email: "parthbasarwadkar@gmail.com", operator: "Verified Operator", expectedDatabase: "heritageversedb" };

  assert.equal(await resetAccountPassword(pool, options, "test-hash-placeholder"), 1);
  const update = pool.calls.find((call) => call.statement.startsWith("UPDATE users SET password_hash"));
  assert.deepEqual(update.values, ["test-hash-placeholder", 1, "parthbasarwadkar@gmail.com", "admin"]);
  assert.match(update.statement, /WHERE id = \$2 AND LOWER\(BTRIM\(email\)\) = \$3 AND role = \$4/);
  assert.ok(pool.calls.some((call) => call.statement === "COMMIT"));
  assert.ok(!pool.calls.some((call) => call.statement.startsWith("UPDATE users SET role")));
});
