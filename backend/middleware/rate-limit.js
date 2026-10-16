"use strict";

function createAttemptLimiter({ windowMs, limit, maxKeys = 5000 }) {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new TypeError("windowMs must be a positive integer");
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("limit must be a positive integer");
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) throw new TypeError("maxKeys must be a positive integer");

  const attempts = new Map();

  function prune(now) {
    for (const [key, values] of attempts) {
      const recent = values.filter((timestamp) => now - timestamp < windowMs);
      if (recent.length) attempts.set(key, recent);
      else attempts.delete(key);
    }
    while (attempts.size > maxKeys) attempts.delete(attempts.keys().next().value);
  }

  function check(key, now = Date.now()) {
    const normalizedKey = String(key ?? "unknown").slice(0, 256);
    const recent = (attempts.get(normalizedKey) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) {
      attempts.set(normalizedKey, recent);
      return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    }

    recent.push(now);
    attempts.set(normalizedKey, recent);
    if (attempts.size > maxKeys) prune(now);
    return 0;
  }

  function reset(key) {
    attempts.delete(String(key ?? "unknown").slice(0, 256));
  }

  return { check, reset, get size() { return attempts.size; } };
}

module.exports = { createAttemptLimiter };
