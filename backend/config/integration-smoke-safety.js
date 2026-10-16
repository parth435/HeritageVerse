"use strict";

const EXPECTED_SMOKE_DATABASE = "heritageverse_smoke_test";
const SAFE_ENVIRONMENTS = new Set(["development", "test"]);

function normalizeAddress(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/^\[|\]$/g, "") : "";
}

function isLoopbackAddress(value) {
  const address = normalizeAddress(value);
  if (address === "::1") return true;
  if (address.startsWith("::ffff:")) return isLoopbackAddress(address.slice(7));
  const octets = address.split(".");
  return octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255) && Number(octets[0]) === 127;
}

function isSafeEnvironment(value) {
  return SAFE_ENVIRONMENTS.has(String(value || "").trim().toLowerCase());
}

function validateDatabaseIdentity(value) {
  const identity = {
    databaseName: typeof value?.databaseName === "string" ? value.databaseName : "",
    schemaName: typeof value?.schemaName === "string" ? value.schemaName : "",
    serverAddress: normalizeAddress(value?.serverAddress),
    serverPort: Number(value?.serverPort),
  };
  if (
    identity.databaseName !== EXPECTED_SMOKE_DATABASE ||
    identity.schemaName !== "public" ||
    !isLoopbackAddress(identity.serverAddress) ||
    !Number.isInteger(identity.serverPort) || identity.serverPort < 1 || identity.serverPort > 65_535
  ) {
    throw new Error("Integration smoke target is not the isolated loopback test database.");
  }
  return identity;
}

function assertMatchingDatabaseTargets(apiIdentity, cleanupIdentity) {
  const api = validateDatabaseIdentity(apiIdentity);
  const cleanup = validateDatabaseIdentity(cleanupIdentity);
  if (
    api.databaseName !== cleanup.databaseName ||
    api.schemaName !== cleanup.schemaName ||
    api.serverAddress !== cleanup.serverAddress ||
    api.serverPort !== cleanup.serverPort
  ) {
    throw new Error("API and cleanup database targets do not match; smoke test refused before mutation.");
  }
  return api;
}

module.exports = {
  EXPECTED_SMOKE_DATABASE,
  SAFE_ENVIRONMENTS,
  assertMatchingDatabaseTargets,
  isLoopbackAddress,
  isSafeEnvironment,
  validateDatabaseIdentity,
};
