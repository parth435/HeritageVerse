"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const journeysRouter = require("../modules/journeys");
const favoritesRouter = require("../modules/favorites");

const testSecret = "isolated-ownership-tests-use-this-non-production-secret";
const originalSecret = process.env.JWT_SECRET;
const originalQuery = pool.query;
const originalNodeEnv = process.env.NODE_ENV;

process.env.JWT_SECRET = testSecret;
process.env.NODE_ENV = "test";

const seen = [];

pool.query = async (sql, values = []) => {
  seen.push({ sql: String(sql), values });
  if (String(sql).includes("FROM users WHERE id = $1")) {
    return { rows: [{ role: "user", status: "ACTIVE" }] };
  }
  if (String(sql).includes("FROM journeys WHERE user_id")) {
    return { rows: [{ id: 7, name: "Mine", description: null, created_at: "2026-01-01", updated_at: "2026-01-01" }] };
  }
  if (String(sql).includes("FROM journeys WHERE id = $1 AND user_id = $2") || String(sql).includes("FROM journeys WHERE id=$1 AND user_id=$2")) {
    return Number(values[1]) === 3 ? { rows: [{ id: values[0] }] } : { rows: [] };
  }
  if (String(sql).includes("FROM favorites")) {
    assert.equal(values[0], 3);
    return { rows: [] };
  }
  return { rows: [] };
};

function token(userId) {
  return jwt.sign({}, testSecret, { algorithm: "HS256", subject: String(userId), expiresIn: "5m" });
}

test("user-specific journeys and favorites stay scoped to the authenticated user", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api", journeysRouter);
  app.use("/api", favoritesRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    await t.test("listing journeys binds the authenticated user id", async () => {
      seen.length = 0;
      const response = await fetch(`${origin}/api/journeys`, {
        headers: { Authorization: `Bearer ${token(3)}` },
      });
      assert.equal(response.status, 200);
      assert.equal(seen[0].values[0], 3);
    });

    await t.test("another user cannot load a journey they do not own", async () => {
      const response = await fetch(`${origin}/api/journeys/7`, {
        headers: { Authorization: `Bearer ${token(9)}` },
      });
      assert.equal(response.status, 404);
    });

    await t.test("favorites listing uses the authenticated user id", async () => {
      seen.length = 0;
      const response = await fetch(`${origin}/api/favorites`, {
        headers: { Authorization: `Bearer ${token(3)}` },
      });
      assert.equal(response.status, 200);
      assert.ok(seen.some((call) => call.values[0] === 3));
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    pool.query = originalQuery;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});
