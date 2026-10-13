"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const adminRouter = require("../modules/admin");

const testSecret = "isolated-admin-tests-use-this-non-production-secret";
const originalSecret = process.env.JWT_SECRET;
const originalQuery = pool.query;
const originalConnect = pool.connect;
const originalNodeEnv = process.env.NODE_ENV;

process.env.JWT_SECRET = testSecret;
process.env.NODE_ENV = "test";

const roles = new Map([[1, "user"], [2, "admin"]]);
const calls = [];
let failNextClientWrite = null;
let failNextAdminList = false;

function databaseError(code) {
  const error = new Error("mock database failure");
  error.code = code;
  return error;
}

pool.query = async (sql, values = []) => {
  calls.push({ source: "pool", sql: String(sql), values });
  if (String(sql).includes("COALESCE(to_jsonb(users)")) {
    return { rows: [{ role: roles.get(Number(values[0])) ?? "user" }] };
  }
  if (String(sql).startsWith("SELECT latitude, longitude FROM heritage")) {
    return { rows: [{ latitude: 28.524483, longitude: 77.185397 }] };
  }
  if (String(sql).startsWith("SELECT h.*,")) {
    return { rows: [{ id: Number(values[0]), name: "Test Heritage Record", coordinate_source_confidence: 0.99, coordinate_review_status: "approved" }] };
  }
  if (String(sql).includes("AS provider_network_errors")) {
    return { rows: [{ verified: 7, missing: 12, needs_review: 3, provider_network_errors: 1 }] };
  }
  if (String(sql).includes("m.id AS media_id")) {
    return { rows: [{ heritage_id: 14, media_id: 33, name: "Verified Test Place", slug: "verified-test-place", state: "Maharashtra", district: "Mumbai", url: "https://commons.wikimedia.org/example.jpg", thumbnail_url: "https://commons.wikimedia.org/thumb.jpg", creator: "Test Photographer", license: "CC BY-SA 4.0", license_url: "https://creativecommons.org/licenses/by-sa/4.0/", source_url: "https://commons.wikimedia.org/wiki/File:Example.jpg", provider: "wikimedia", verification_status: "verified" }] };
  }
  if (String(sql).includes("a.status AS acquisition_status")) {
    return { rows: [{ heritage_id: 15, name: "Review Test Place", slug: "review-test-place", state: "Maharashtra", district: "Pune", publication_status: "published", acquisition_status: "failed", error_code: "provider_network_error", error_message: "External request failed", last_checked_at: null, retry_count: 2, candidates: [], unverified_images: [] }] };
  }
  if (failNextAdminList && String(sql).includes("FROM heritage h JOIN heritage_categories")) {
    failNextAdminList = false;
    throw databaseError("08006");
  }
  if (String(sql).startsWith("SELECT COUNT(*)")) return { rows: [{ total: 1, published: 1, draft: 0 }] };
  if (String(sql).startsWith("UPDATE heritage SET publication_status='archived'")) {
    return { rows: [{ id: Number(values[0]), publication_status: "archived" }] };
  }
  return { rows: [] };
};

pool.connect = async () => ({
  async query(sql, values = []) {
    const statement = String(sql);
    calls.push({ source: "client", sql: statement, values });
    if (statement.startsWith("SELECT latitude, longitude FROM heritage")) {
      return { rows: [{ latitude: 28.524483, longitude: 77.185397 }] };
    }
    if (failNextClientWrite && statement.startsWith("INSERT INTO heritage")) {
      const code = failNextClientWrite;
      failNextClientWrite = null;
      throw databaseError(code);
    }
    if (statement.startsWith("INSERT INTO heritage (")) {
      return { rows: [{ id: 91, name: values[0], slug: values[1], publication_status: values[14] }] };
    }
    if (statement.startsWith("UPDATE heritage SET name=")) {
      return { rows: [{ id: Number(values[16]), name: values[0], slug: values[1], publication_status: values[15] }] };
    }
    return { rows: [] };
  },
  release() {},
});

function token(userId, roleClaim) {
  return jwt.sign(roleClaim ? { role: roleClaim } : {}, testSecret, {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: "5m",
  });
}

function heritageBody(overrides = {}) {
  return {
    name: "Test Heritage Record",
    slug: "test-heritage-record",
    description: "Test description",
    history: "Test history",
    cultural_significance: "Test significance",
    architecture: "Test architecture",
    historical_period: "Test period",
    category_id: 1,
    state: "Delhi",
    district: "",
    locality: "",
    address: "",
    latitude: "",
    longitude: "",
    publication_status: "draft",
    ...overrides,
  };
}

test("admin authorization and heritage CRUD use server roles and soft archive", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api", adminRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = "GET", body, as } = {}) => {
    const headers = {};
    if (as) headers.Authorization = `Bearer ${as}`;
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, payload: await response.json() };
  };

  try {
    await t.test("unauthenticated and ordinary users cannot access admin routes", async () => {
      calls.length = 0;
      assert.equal((await request("/admin/dashboard")).status, 401);
      assert.equal(calls.length, 0);
      assert.equal((await request("/admin/dashboard", { as: token(1) })).status, 403);
      assert.equal((await request("/admin/dashboard", { as: token(1, "admin") })).status, 403);
      assert.equal((await request("/admin/images?view=verified")).status, 401);
      assert.equal((await request("/admin/images?view=verified", { as: token(1) })).status, 403);
      assert.equal((await request("/admin/heritage", { as: token(1) })).status, 403);
    });

    await t.test("authorized admin can read dashboard and create/edit/archive records", async () => {
      const admin = token(2);
      const dashboard = await request("/admin/dashboard", { as: admin });
      assert.equal(dashboard.status, 200);
      assert.deepEqual(dashboard.payload.dashboard.images, { verified: 7, missing: 12, needs_review: 3, provider_network_errors: 1 });
      const filtered = await request("/admin/heritage?q=Ajanta&state=Maharashtra&category=2&status=published&limit=5000&offset=-3", { as: admin });
      assert.equal(filtered.status, 200);
      const listCall = calls.findLast((call) => call.sql.includes("FROM heritage h JOIN heritage_categories"));
      assert.ok(listCall);
      assert.match(listCall.sql, /h\.name ILIKE \$1/);
      assert.deepEqual(listCall.values, ["%Ajanta%", "Maharashtra", 2, "published", 100, 0]);
      assert.equal((await request("/admin/heritage?category=not-a-number", { as: admin })).status, 400);
      const verified = await request("/admin/images?view=verified", { as: admin });
      assert.equal(verified.status, 200);
      assert.equal(verified.payload.images[0].creator, "Test Photographer");
      assert.equal(verified.payload.images[0].license, "CC BY-SA 4.0");
      const review = await request("/admin/images?view=review", { as: admin });
      assert.equal(review.status, 200);
      assert.equal(review.payload.images[0].error_code, "provider_network_error");
      assert.equal((await request("/admin/images?view=all", { as: admin })).status, 400);
      const detail = await request("/admin/heritage/91", { as: admin });
      assert.equal(detail.status, 200);
      assert.equal(detail.payload.heritage.coordinate_review_status, "approved");
      const detailStatement = calls.findLast((call) => call.sql.startsWith("SELECT h.*,"))?.sql ?? "";
      assert.match(detailStatement, /SELECT source_title, publisher, source_url, confidence, review_status/);

      const sourcedBody = heritageBody({
        latitude: "28.524483",
        longitude: "77.185397",
        coordinate_source_title: "Official coordinate record",
        coordinate_source_publisher: "Test publisher",
        coordinate_source_url: "https://example.org/coordinates",
        coordinate_source_confidence: "0.99",
      });
      const created = await request("/admin/heritage", { method: "POST", body: sourcedBody, as: admin });
      assert.equal(created.status, 201);
      assert.ok(calls.some((call) => call.sql.startsWith("INSERT INTO heritage_sources")));
      assert.ok(calls.some((call) => call.sql === "COMMIT"));

      const updated = await request("/admin/heritage/91", {
        method: "PATCH",
        body: heritageBody({
          slug: "test-heritage-record-edited",
          latitude: "28.524483",
          longitude: "77.185397",
          coordinate_source_title: "Updated coordinate record",
          coordinate_source_publisher: "Test publisher",
          coordinate_source_url: "https://example.org/coordinates-v2",
          coordinate_source_confidence: "0.98",
        }),
        as: admin,
      });
      assert.equal(updated.status, 200);
      assert.ok(calls.some((call) => call.sql.startsWith("UPDATE heritage_sources")));

      const citationsBeforePreserve = calls.filter((call) => call.sql.startsWith("UPDATE heritage_sources")).length;
      const preserveSource = await request("/admin/heritage/91", {
        method: "PATCH",
        body: heritageBody({ slug: "test-heritage-record-unchanged-coordinates", latitude: "28.524483", longitude: "77.185397" }),
        as: admin,
      });
      assert.equal(preserveSource.status, 200);
      assert.equal(calls.filter((call) => call.sql.startsWith("UPDATE heritage_sources")).length, citationsBeforePreserve, "unchanged verified coordinates should retain their existing citation");

      const beforeInvalidCoordinateUpdate = calls.length;
      const changedWithoutSource = await request("/admin/heritage/91", {
        method: "PATCH",
        body: heritageBody({ latitude: "28.6", longitude: "77.3" }),
        as: admin,
      });
      assert.equal(changedWithoutSource.status, 400);
      assert.equal(calls.slice(beforeInvalidCoordinateUpdate).some((call) => call.sql.startsWith("UPDATE heritage SET name=")), false, "coordinates must not change without their reviewed source");

      const archived = await request("/admin/heritage/91", { method: "DELETE", as: admin });
      assert.equal(archived.status, 200);
      assert.equal(archived.payload.heritage.publication_status, "archived");
      const archiveStatement = calls.findLast((call) => call.sql.includes("publication_status='archived'"))?.sql ?? "";
      assert.match(archiveStatement, /^UPDATE heritage SET publication_status='archived'/);
      assert.doesNotMatch(archiveStatement, /\bDELETE\b|favorites|visited_places|reviews|journey_stops/i);
    });

    await t.test("invalid input is rejected before database writes", async () => {
      const admin = token(2);
      const before = calls.length;
      assert.equal((await request("/admin/heritage", { method: "POST", body: heritageBody({ name: "" }), as: admin })).status, 400);
      assert.equal((await request("/admin/heritage", { method: "POST", body: heritageBody({ latitude: "28.5", longitude: "77.2" }), as: admin })).status, 400);
      assert.equal((await request("/admin/heritage", { method: "POST", body: heritageBody({ latitude: "28.5", longitude: "77.2", coordinate_source_title: "Coordinates", coordinate_source_publisher: "Publisher", coordinate_source_url: "http://example.org/coordinates" }), as: admin })).status, 400);
      assert.equal((await request("/admin/heritage", { method: "POST", body: heritageBody({ latitude: "28.5", longitude: "77.2", coordinate_source_title: "Coordinates", coordinate_source_publisher: "Publisher", coordinate_source_url: "https://example.org/coordinates", coordinate_source_confidence: "0.94" }), as: admin })).status, 400);
      assert.equal(calls.slice(before).some((call) => call.sql.startsWith("INSERT INTO heritage (")), false);
    });

    await t.test("database failures return safe errors and preserve transaction boundaries", async () => {
      const admin = token(2);
      failNextClientWrite = "23505";
      const duplicate = await request("/admin/heritage", { method: "POST", body: heritageBody(), as: admin });
      assert.equal(duplicate.status, 409);
      assert.ok(calls.some((call) => call.sql === "ROLLBACK"));

      failNextAdminList = true;
      const unavailable = await request("/admin/heritage", { as: admin });
      assert.equal(unavailable.status, 500);
      assert.equal(unavailable.payload.message, "Failed to load heritage entries");
      assert.doesNotMatch(JSON.stringify(unavailable.payload), /mock database failure|08006/);
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
