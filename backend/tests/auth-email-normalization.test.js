"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { NORMALIZED_EMAIL_PREDICATE, normalizeEmail, selectUniqueAccount } = require("../modules/auth-identity");

test("authentication normalizes user email input consistently", () => {
  assert.equal(normalizeEmail("  Heritage.User@Example.com  "), "heritage.user@example.com");
  assert.equal(normalizeEmail(undefined), "");
  assert.equal(normalizeEmail(42), "");
});

test("sign-in fails closed when case-insensitive lookup finds duplicate accounts", () => {
  const account = { id: 1 };
  assert.equal(selectUniqueAccount([account]), account);
  assert.equal(selectUniqueAccount([]), null);
  assert.equal(selectUniqueAccount([account, { id: 2 }]), null);
});

test("signup duplicate checks and signin lookup match legacy email casing safely", () => {
  const backendSource = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");

  assert.equal(NORMALIZED_EMAIL_PREDICATE, "LOWER(BTRIM(email)) = $1");
  assert.equal((backendSource.match(/NORMALIZED_EMAIL_PREDICATE/g) ?? []).length, 3);
  assert.match(backendSource, /ORDER BY id ASC LIMIT 2/);
  assert.match(backendSource, /selectUniqueAccount\(result\.rows\)/);
  assert.match(backendSource, /Invalid email or password/);
});

test("signin reads the same email and password fields sent by the frontend and verifies the stored bcrypt hash", () => {
  const backendSource = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");
  const apiSource = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/lib/api.ts"), "utf8");
  const authSource = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/lib/auth.ts"), "utf8");
  const adminLoginSource = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/components/admin/AdminLoginPage.tsx"), "utf8");

  assert.match(backendSource, /const email = normalizeEmail\(req\.body\?\.email\)/);
  assert.match(backendSource, /const password = typeof req\.body\?\.password === "string" \? req\.body\.password : ""/);
  assert.match(backendSource, /bcrypt\.compare\(\s*password,\s*user\.password_hash\s*\)/);
  assert.match(authSource, /authSignin\(\{ email: email\.trim\(\), password \}\)/);
  assert.match(apiSource, /"auth\/signin"[\s\S]*body: input/);
  assert.match(adminLoginSource, /signIn\(email, password\)/);
});
