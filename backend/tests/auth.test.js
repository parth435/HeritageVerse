const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const { authenticate, createAuthToken, getJwtSecret } = require("../middleware/auth");

function withEnvironment(values, callback) {
  const original = new Map();

  for (const [key, value] of Object.entries(values)) {
    original.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    callback();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withEnvironmentAsync(values, callback) {
  const original = new Map();
  for (const [key, value] of Object.entries(values)) {
    original.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withPoolQuery(query, callback) {
  const originalQuery = pool.query;
  pool.query = query;
  try {
    await callback();
  } finally {
    pool.query = originalQuery;
  }
}

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("production JWT configuration rejects short and placeholder secrets", () => {
  withEnvironment({ NODE_ENV: "production", JWT_SECRET: "short-secret" }, () => {
    assert.throws(getJwtSecret, /non-placeholder secret of at least 32 characters/);
    process.env.JWT_SECRET = "replace-this-with-a-generated-secret-of-at-least-32-characters";
    assert.throws(getJwtSecret, /non-placeholder secret of at least 32 characters/);
    process.env.JWT_SECRET = "a".repeat(48);
    assert.equal(getJwtSecret(), "a".repeat(48));
  });
});

test("authentication rejects missing or malformed bearer authorization", async () => {
  for (const authorization of [undefined, "Basic abc", "Bearer"]) {
    const response = mockResponse();
    const request = { get: () => authorization };

    await authenticate(request, response, () => assert.fail("next must not run"));
    assert.equal(response.statusCode, 401);
    assert.match(response.body.message, /required|Bearer scheme/);
  }
});

test("authentication rejects expired JWTs", async () => {
  withEnvironment({ JWT_SECRET: "unit-test-secret" }, () => {
    const expired = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: "1",
      expiresIn: -1,
    });
    const response = mockResponse();

    return authenticate({ get: () => `Bearer ${expired}` }, response, () => assert.fail("next must not run")).then(() => {
      assert.equal(response.statusCode, 401);
      assert.equal(response.body.message, "Authentication token is invalid or expired");
    });
  });
});

test("verified JWT role claims do not grant administrator privileges", async () => {
  await withPoolQuery(async () => ({ rows: [{ role: "user", status: "ACTIVE" }] }), async () => {
    await withEnvironmentAsync({ JWT_SECRET: "unit-test-secret" }, async () => {
    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: "23",
      expiresIn: "1m",
    });
    const request = { get: () => `Bearer ${token}` };
    let nextCalled = false;

    await authenticate(request, mockResponse(), () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(request.user, { id: 23, role: "user", status: "ACTIVE" });
    assert.deepEqual(request.auth, { userId: 23 });
    });
  });
});

test("deleted and suspended accounts cannot keep using an old token", async (t) => {
  await t.test("deleted account is rejected", async () => {
    await withPoolQuery(async () => ({ rows: [] }), async () => {
      await withEnvironmentAsync({ JWT_SECRET: "unit-test-secret" }, async () => {
        const response = mockResponse();
        const token = jwt.sign({}, process.env.JWT_SECRET, { algorithm: "HS256", subject: "23", expiresIn: "1m" });
        await authenticate({ get: () => `Bearer ${token}` }, response, () => assert.fail("next must not run"));
        assert.equal(response.statusCode, 401);
      });
    });
  });

  await t.test("suspended account is rejected", async () => {
    await withPoolQuery(async () => ({ rows: [{ role: "admin", status: "SUSPENDED" }] }), async () => {
      await withEnvironmentAsync({ JWT_SECRET: "unit-test-secret" }, async () => {
        const response = mockResponse();
        const token = jwt.sign({}, process.env.JWT_SECRET, { algorithm: "HS256", subject: "23", expiresIn: "1m" });
        await authenticate({ get: () => `Bearer ${token}` }, response, () => assert.fail("next must not run"));
        assert.equal(response.statusCode, 403);
      });
    });
  });
});

test("authentication tokens require a positive safe-integer user ID", () => {
  assert.throws(() => createAuthToken({ id: "0" }), /valid user ID/);
  assert.throws(() => createAuthToken({ id: Number.MAX_SAFE_INTEGER + 1 }), /valid user ID/);
});
