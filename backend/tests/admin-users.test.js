"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const adminRouter = require("../modules/admin");

const secret = "admin-user-tests-use-an-isolated-non-production-secret";
const originalQuery = pool.query;
const originalConnect = pool.connect;
const originalSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

function account(id, name, email, role, status = "ACTIVE") {
  return { id, name, email, role, status, created_at: `2026-01-0${id}T00:00:00.000Z`, password_hash: "never-return-this" };
}

test("admin user management enforces database roles, validates changes, and audits mutations", async (t) => {
  process.env.JWT_SECRET = secret;
  process.env.NODE_ENV = "test";
  const users = new Map([
    [1, account(1, "Ordinary User", "user@example.invalid", "user")],
    [2, account(2, "First Admin", "admin-one@example.invalid", "admin")],
    [3, account(3, "Second Admin", "admin-two@example.invalid", "admin")],
    [4, account(4, "Suspended User", "suspended@example.invalid", "user", "SUSPENDED")],
  ]);
  const calls = [];
  const auditEvents = [];
  let authBarrier = null;
  let releaseAuthBarrier = null;
  let authArrivals = 0;
  let adminLockTail = Promise.resolve();

  pool.query = async (sql, values = []) => {
    const statement = String(sql);
    calls.push({ source: "pool", statement, values });
    if (statement.includes("COALESCE(to_jsonb(users) ->> 'role'")) {
      const user = users.get(Number(values[0]));
      const authorization = user ? { role: user.role, status: user.status } : null;
      if (authBarrier) {
        authArrivals += 1;
        if (authArrivals === 2) releaseAuthBarrier();
        await authBarrier;
      }
      return { rows: authorization ? [authorization] : [] };
    }
    if (statement.startsWith("SELECT id, name, email, role, status, created_at FROM users")) {
      return { rows: [users.get(1)].map(({ password_hash, ...safe }) => safe) };
    }
    if (statement.startsWith("SELECT COUNT(*)::INTEGER AS total FROM users")) return { rows: [{ total: users.size }] };
    if (statement.startsWith("SELECT u.id, u.name, u.email")) {
      const user = users.get(Number(values[0]));
      if (!user) return { rows: [] };
      const { password_hash, ...safe } = user;
      return { rows: [{ ...safe, favorites_count: 2, visits_count: 3, reviews_count: 1, journeys_count: 1 }] };
    }
    return { rows: [] };
  };

  pool.connect = async () => {
    let releaseAdminLock = null;
    return {
    async query(sql, values = []) {
      const statement = String(sql);
      calls.push({ source: "client", statement, values });
      if (statement.startsWith("SELECT pg_advisory_xact_lock")) {
        const previousLock = adminLockTail;
        let unlock;
        adminLockTail = new Promise((resolve) => { unlock = resolve; });
        await previousLock;
        releaseAdminLock = unlock;
        return { rows: [] };
      }
      if (statement === "COMMIT" || statement === "ROLLBACK") {
        releaseAdminLock?.();
        releaseAdminLock = null;
        return { rows: [] };
      }
      if (statement.startsWith("SELECT id, name, email, role, status, created_at FROM users WHERE id=$1 FOR UPDATE")) {
        const user = users.get(Number(values[0]));
        if (!user) return { rows: [] };
        const { password_hash, ...safe } = user;
        return { rows: [safe] };
      }
      if (statement.startsWith("SELECT COUNT(*)::INTEGER AS total FROM users WHERE role='admin'")) {
        return { rows: [{ total: [...users.values()].filter((user) => user.role === "admin" && user.status === "ACTIVE").length }] };
      }
      const update = statement.match(/^UPDATE users SET (role|status)=\$1 WHERE id=\$2/);
      if (update) {
        const user = users.get(Number(values[1]));
        user[update[1]] = values[0];
        const { password_hash, ...safe } = user;
        return { rows: [safe] };
      }
      if (statement.startsWith("INSERT INTO activity_logs")) {
        auditEvents.push({ title: values[0], entityId: values[1], actorId: values[2] });
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {
      releaseAdminLock?.();
      calls.push({ source: "client", statement: "RELEASE", values: [] });
    },
  };
  };

  const app = express();
  app.use(express.json());
  app.use("/api", adminRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const token = (userId, roleClaim) => jwt.sign(roleClaim ? { role: roleClaim } : {}, secret, { algorithm: "HS256", subject: String(userId), expiresIn: "5m" });
  const request = async (path, { method = "GET", body, as } = {}) => {
    const headers = {};
    if (as) headers.Authorization = `Bearer ${as}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${origin}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, payload: await response.json() };
  };
  const admin = token(2);

  try {
    await t.test("anonymous, invalid-token, and ordinary users cannot access management endpoints", async () => {
      assert.equal((await request("/admin/users")).status, 401);
      assert.equal((await request("/admin/users", { as: "invalid-token" })).status, 401);
      assert.equal((await request("/admin/users", { as: token(1, "admin") })).status, 403);
      assert.equal((await request("/admin/users/1/role", { method: "PATCH", as: token(1, "admin"), body: { role: "admin" } })).status, 403);
    });

    await t.test("listing is paginated, filterable, and returns no password data", async () => {
      calls.length = 0;
      const result = await request("/admin/users?q=First%20Admin&role=admin&status=ACTIVE&limit=12&offset=24", { as: admin });
      assert.equal(result.status, 200);
      assert.equal(result.payload.success, true);
      assert.equal(result.payload.pagination.limit, 12);
      assert.equal(result.payload.pagination.offset, 24);
      assert.equal("password_hash" in result.payload.users[0], false);
      const listQuery = calls.find((call) => call.statement.startsWith("SELECT id, name, email, role, status, created_at FROM users"));
      assert.ok(listQuery);
      assert.match(listQuery.statement, /name ILIKE \$1 OR email ILIKE \$1/);
      assert.deepEqual(listQuery.values, ["%First Admin%", "admin", "ACTIVE", 12, 24]);
      assert.equal((await request("/admin/users?role=owner", { as: admin })).status, 400);
      assert.equal((await request("/admin/users?limit=0", { as: admin })).status, 400);
    });

    await t.test("details expose account activity counts but no credentials", async () => {
      assert.equal((await request("/admin/users/nope", { as: admin })).status, 400);
      const result = await request("/admin/users/1", { as: admin });
      assert.equal(result.status, 200);
      assert.equal(result.payload.user.favorites_count, 2);
      assert.equal(result.payload.user.visits_count, 3);
      assert.equal("password_hash" in result.payload.user, false);
      assert.equal((await request("/admin/users/99", { as: admin })).status, 404);
    });

    await t.test("promotion is validated, status-aware, and recorded in the activity log", async () => {
      assert.equal((await request("/admin/users/1/role", { method: "PATCH", as: admin, body: { role: "superadmin" } })).status, 400);
      const promoted = await request("/admin/users/1/role", { method: "PATCH", as: admin, body: { role: "admin" } });
      assert.equal(promoted.status, 200);
      assert.equal(promoted.payload.user.role, "admin");
      assert.equal(auditEvents.at(-1).entityId, 1);
      assert.equal(auditEvents.at(-1).actorId, 2);
      assert.match(auditEvents.at(-1).title, /role changed from user to admin/);

      assert.equal((await request("/admin/users/4/role", { method: "PATCH", as: admin, body: { role: "admin" } })).status, 409);
      assert.equal((await request("/admin/users/not-an-id/role", { method: "PATCH", as: admin, body: { role: "admin" } })).status, 400);
    });

    await t.test("admins may demote another administrator but cannot demote themselves", async () => {
      const demoted = await request("/admin/users/3/role", { method: "PATCH", as: admin, body: { role: "user" } });
      assert.equal(demoted.status, 200);
      assert.equal(demoted.payload.user.role, "user");
      assert.equal((await request("/admin/users/2/role", { method: "PATCH", as: admin, body: { role: "user" } })).status, 409);
    });

    await t.test("admins can suspend and reactivate accounts; self-suspension is blocked", async () => {
      const suspended = await request("/admin/users/1/status", { method: "PATCH", as: admin, body: { status: "SUSPENDED" } });
      assert.equal(suspended.status, 200);
      assert.equal(suspended.payload.user.status, "SUSPENDED");
      assert.match(auditEvents.at(-1).title, /account status changed from ACTIVE to SUSPENDED/);
      const reactivated = await request("/admin/users/1/status", { method: "PATCH", as: admin, body: { status: "ACTIVE" } });
      assert.equal(reactivated.status, 200);
      assert.equal(reactivated.payload.user.status, "ACTIVE");
      assert.equal((await request("/admin/users/2/status", { method: "PATCH", as: admin, body: { status: "SUSPENDED" } })).status, 409);
      assert.equal((await request("/admin/users/1/status", { method: "PATCH", as: admin, body: { status: "PAUSED" } })).status, 400);
      const auditCall = calls.findLast((call) => call.statement.startsWith("INSERT INTO activity_logs"));
      const commitIndex = calls.findLastIndex((call) => call.statement === "COMMIT");
      const auditIndex = calls.findLastIndex((call) => call.statement.startsWith("INSERT INTO activity_logs"));
      assert.ok(auditIndex >= 0 && auditIndex < commitIndex, "audit entry must be committed with the account change");
      assert.ok(auditCall);
    });

    await t.test("concurrent reciprocal demotions cannot remove the last active administrator", async () => {
      const lockCountBefore = calls.filter((call) => call.statement.startsWith("SELECT pg_advisory_xact_lock")).length;
      authArrivals = 0;
      authBarrier = new Promise((resolve) => { releaseAuthBarrier = resolve; });
      const results = await Promise.all([
        request("/admin/users/2/role", { method: "PATCH", as: token(1), body: { role: "user" } }),
        request("/admin/users/1/role", { method: "PATCH", as: token(2), body: { role: "user" } }),
      ]);
      authBarrier = null;
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      assert.match(results.find((result) => result.status === 409).payload.message, /last active administrator/i);
      assert.equal([...users.values()].filter((user) => user.role === "admin" && user.status === "ACTIVE").length, 1);
      const lockCountAfter = calls.filter((call) => call.statement.startsWith("SELECT pg_advisory_xact_lock")).length;
      assert.equal(lockCountAfter - lockCountBefore, 2);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});
