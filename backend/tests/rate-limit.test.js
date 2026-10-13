"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAttemptLimiter } = require("../middleware/rate-limit");

test("attempt limiter blocks only within the configured time window", () => {
  const limiter = createAttemptLimiter({ windowMs: 1000, limit: 2 });
  assert.equal(limiter.check("client", 1000), 0);
  assert.equal(limiter.check("client", 1100), 0);
  assert.equal(limiter.check("client", 1200), 1);
  assert.equal(limiter.check("client", 2000), 0);
});

test("attempt limiter can clear a successful login and bounds key storage", () => {
  const limiter = createAttemptLimiter({ windowMs: 1000, limit: 1, maxKeys: 2 });
  assert.equal(limiter.check("first", 1000), 0);
  assert.equal(limiter.check("first", 1001), 1);
  limiter.reset("first");
  assert.equal(limiter.check("first", 1002), 0);
  limiter.check("second", 1002);
  limiter.check("third", 1002);
  assert.equal(limiter.size, 2);
});
