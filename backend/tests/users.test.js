"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const usersRouter = require("../modules/users");

const originalQuery = pool.query;
const originalSecret = process.env.JWT_SECRET;
const secret = "profile-tests-use-an-isolated-non-production-secret";

test("profile routes are authenticated, parameterized, and cannot change role or status", async (t) => {
  process.env.JWT_SECRET = secret;
  const calls = [];
  let profileExists = true;
  pool.query = async (sql, values = []) => {
    const statement = String(sql);
    calls.push({ statement, values });
    if (statement.startsWith("SELECT COALESCE(to_jsonb(users) ->> 'role'")) {
      return { rows: [{ role: "user", status: "ACTIVE" }] };
    }
    if (statement.startsWith("SELECT id, name, email")) {
      return { rows: profileExists ? [{ id: 41, name: "Asha Rao", email: "asha@example.invalid", role: "user", status: "ACTIVE", created_at: "2026-01-01T00:00:00.000Z" }] : [] };
    }
    if (statement.startsWith("UPDATE users SET name = $1 WHERE id = $2")) {
      return { rows: profileExists ? [{ id: 41, name: values[0], email: "asha@example.invalid", role: "user", status: "ACTIVE", created_at: "2026-01-01T00:00:00.000Z" }] : [] };
    }
    return { rows: [] };
  };

  const app = express();
  app.use(express.json());
  app.use("/api", usersRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({}, secret, { algorithm: "HS256", subject: "41", expiresIn: "5m" });
  const request = async (path, { method = "GET", body, bearer } = {}) => {
    const headers = {};
    if (bearer !== undefined) headers.Authorization = `Bearer ${bearer}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${origin}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, payload: await response.json() };
  };

  try {
    await t.test("anonymous and invalid-token profile requests are rejected", async () => {
      calls.length = 0;
      assert.equal((await request("/users/me")).status, 401);
      assert.equal((await request("/users/me", { bearer: "not-a-jwt" })).status, 401);
      assert.equal(calls.filter((call) => call.statement.startsWith("SELECT id, name, email")).length, 0);
    });

    await t.test("profile read and update return the same safe account fields", async () => {
      const profile = await request("/users/me", { bearer: token });
      assert.equal(profile.status, 200);
      assert.deepEqual(profile.payload.user, { id: 41, name: "Asha Rao", email: "asha@example.invalid", role: "user", status: "ACTIVE", created_at: "2026-01-01T00:00:00.000Z" });

      const updated = await request("/users/me", { method: "PATCH", bearer: token, body: { name: "Asha New" } });
      assert.equal(updated.status, 200);
      assert.equal(updated.payload.user.name, "Asha New");
      assert.equal(updated.payload.user.role, "user");
      assert.equal(updated.payload.user.status, "ACTIVE");
      const update = calls.findLast((call) => call.statement.startsWith("UPDATE users SET name = $1"));
      assert.ok(update);
      assert.match(update.statement, /WHERE id = \$2/);
      assert.deepEqual(update.values, ["Asha New", 41]);
    });

    await t.test("profile endpoint refuses role and status changes", async () => {
      const before = calls.filter((call) => call.statement.startsWith("UPDATE users SET name = $1")).length;
      const roleAttempt = await request("/users/me", { method: "PATCH", bearer: token, body: { name: "Asha Rao", role: "admin" } });
      assert.equal(roleAttempt.status, 400);
      const statusAttempt = await request("/users/me", { method: "PATCH", bearer: token, body: { name: "Asha Rao", status: "SUSPENDED" } });
      assert.equal(statusAttempt.status, 400);
      assert.equal(calls.filter((call) => call.statement.startsWith("UPDATE users SET name = $1")).length, before);
    });

    await t.test("invalid profile values and missing accounts have consistent errors", async () => {
      assert.equal((await request("/users/me", { method: "PATCH", bearer: token, body: { name: " " } })).status, 400);
      profileExists = false;
      const missing = await request("/users/me", { bearer: token });
      assert.equal(missing.status, 404);
      assert.deepEqual(missing.payload, { success: false, message: "User account was not found" });
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = originalQuery;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
