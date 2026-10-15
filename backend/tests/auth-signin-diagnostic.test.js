"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcrypt");
const {
  parseArguments,
  validateOptions,
  classifyAccount,
  classifyPassword,
  diagnoseSignIn,
} = require("../database/diagnose-signin");

const safeArgs = [
  "--user-id", "1",
  "--email", " ParthBasarwadkar@gmail.com ",
  "--expected-host", "ep-verified.us-east-2.aws.neon.tech",
  "--expected-database", "heritageversedb",
  "--identity-verified",
  "--confirm", "CHECK-SIGNIN",
];

const options = {
  userId: 1,
  email: "parthbasarwadkar@gmail.com",
  expectedHost: "ep-verified.us-east-2.aws.neon.tech",
  expectedDatabase: "heritageversedb",
};

test("read-only signin diagnostic requires exact identity and database confirmation", () => {
  assert.deepEqual(validateOptions(parseArguments(safeArgs)), options);
  assert.throws(() => validateOptions(parseArguments(safeArgs.filter((value) => value !== "--identity-verified"))), /identity verification/);
  assert.throws(() => validateOptions(parseArguments([...safeArgs, "--password", "should-not-be-accepted"])), /Unsupported option/);
  assert.throws(() => parseArguments(["--email", "one@example.com", "--email", "two@example.com"]), /Duplicate option/);
});

test("signin diagnostic distinguishes missing, ambiguous, wrong-id, and exact accounts", () => {
  const record = { id: 1, email: "PARTHBASARWADKAR@gmail.com", role: "admin", status: "ACTIVE", password_hash: "unused" };
  assert.equal(classifyAccount([], options).category, "account_not_found");
  assert.equal(classifyAccount([record, { ...record, id: 2 }], options).category, "account_ambiguous");
  assert.equal(classifyAccount([{ ...record, id: 2 }], options).category, "account_id_mismatch");
  assert.equal(classifyAccount([record], options).category, "account_found");
});

test("signin diagnostic compares bcrypt without exposing the hash or password", async () => {
  const password = "operator-entered-unit-test-password";
  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: 1, email: options.email, role: "admin", status: "ACTIVE", password_hash: passwordHash };
  assert.deepEqual(await classifyPassword("incorrect-unit-test-password", user), { category: "password_mismatch" });
  assert.deepEqual(await classifyPassword(password, user), { category: "credentials_valid_admin", role: "admin", status: "ACTIVE" });
  assert.deepEqual(await classifyPassword(password, { ...user, role: "user" }), { category: "credentials_valid_non_admin", role: "user", status: "ACTIVE" });
  assert.deepEqual(await classifyPassword(password, { ...user, status: "SUSPENDED" }), { category: "credentials_valid_account_inactive", role: "admin", status: "SUSPENDED" });
  assert.deepEqual(await classifyPassword(password, { ...user, password_hash: "not-a-bcrypt-hash" }), { category: "stored_hash_unusable" });
});

function mockPool(rows, databaseName = "heritageversedb") {
  const calls = [];
  return {
    calls,
    async query(statement, values = []) {
      calls.push({ statement: String(statement), values });
      if (String(statement).includes("current_database")) return { rows: [{ name: databaseName }] };
      if (String(statement).includes("FROM users")) return { rows };
      throw new Error("Unexpected query in read-only diagnostic test");
    },
  };
}

test("signin diagnostic follows the normalized signin lookup and issues only SELECT queries", async () => {
  const passwordHash = await bcrypt.hash("correct-unit-test-password", 10);
  const pool = mockPool([{ id: 1, email: options.email, role: "admin", status: "ACTIVE", password_hash: passwordHash }]);
  const result = await diagnoseSignIn(pool, options, "correct-unit-test-password");

  assert.deepEqual(result, { category: "credentials_valid_admin", role: "admin", status: "ACTIVE" });
  assert.match(pool.calls[1].statement, /LOWER\(BTRIM\(email\)\) = \$1/);
  assert.deepEqual(pool.calls[1].values, [options.email]);
  assert.ok(pool.calls.every((call) => /^SELECT\b/i.test(call.statement.trim())));
});

test("signin diagnostic refuses a connected database name mismatch before account lookup", async () => {
  const pool = mockPool([], "staging");
  await assert.rejects(diagnoseSignIn(pool, options, "unit-test-password"), /does not match/);
  assert.equal(pool.calls.length, 1);
  assert.ok(pool.calls.every((call) => /^SELECT\b/i.test(call.statement.trim())));
});
