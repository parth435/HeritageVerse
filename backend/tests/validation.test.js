const test = require("node:test");
const assert = require("node:assert/strict");

const { readCoordinate, readPositiveId, readText } = require("../middleware/validation");

test("readPositiveId accepts valid positive integers", () => {
  assert.equal(readPositiveId("42"), 42);
  assert.equal(readPositiveId(7), 7);
  assert.equal(readPositiveId(" 18 "), 18);
  assert.equal(readPositiveId("0"), null);
  assert.equal(readPositiveId("-1"), null);
  assert.equal(readPositiveId("abc"), null);
});

test("readText trims input and enforces size limits", () => {
  assert.equal(readText("  Heritage  "), "Heritage");
  assert.equal(readText("", { required: true }), null);
  assert.equal(readText("hello world", { required: true, maximum: 5 }), null);
  assert.equal(readText("hello"), "hello");
  assert.equal(readText(undefined, { required: false }), "");
});

test("readCoordinate accepts optional, bounded decimal coordinates", () => {
  assert.deepEqual(readCoordinate("", { minimum: -90, maximum: 90 }), { valid: true, value: null });
  assert.deepEqual(readCoordinate(" 27.1751 ", { minimum: -90, maximum: 90 }), { valid: true, value: 27.1751 });
  assert.deepEqual(readCoordinate(-90, { minimum: -90, maximum: 90 }), { valid: true, value: -90 });
  assert.deepEqual(readCoordinate("180", { minimum: -180, maximum: 180 }), { valid: true, value: 180 });
});

test("readCoordinate rejects malformed and out-of-range coordinates", () => {
  for (const value of ["north", "1,2", "Infinity", "91", -91]) {
    assert.equal(readCoordinate(value, { minimum: -90, maximum: 90 }).valid, false);
  }
  assert.equal(readCoordinate("181", { minimum: -180, maximum: 180 }).valid, false);
  assert.equal(readCoordinate(true, { minimum: -90, maximum: 90 }).valid, false);
});
