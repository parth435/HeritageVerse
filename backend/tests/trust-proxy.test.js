"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readTrustedProxyHops } = require("../middleware/trust-proxy");

test("trusted proxy hop configuration defaults to direct-client mode", () => {
  assert.equal(readTrustedProxyHops(undefined), 0);
  assert.equal(readTrustedProxyHops(""), 0);
});

test("trusted proxy hop configuration accepts bounded integer counts", () => {
  assert.equal(readTrustedProxyHops("1"), 1);
  assert.equal(readTrustedProxyHops("5"), 5);
  assert.equal(readTrustedProxyHops("1", true), 1);
});

test("trusted proxy hop configuration rejects unsafe or ambiguous values", () => {
  for (const value of ["-1", "6", "1.5", "true", "loopback", "1,2"]) {
    assert.throws(() => readTrustedProxyHops(value), /TRUST_PROXY_HOPS/);
  }
});

test("production requires an explicit trusted proxy hop", () => {
  assert.throws(() => readTrustedProxyHops(undefined, true), /greater than 0 in production/);
  assert.throws(() => readTrustedProxyHops("0", true), /greater than 0 in production/);
});
