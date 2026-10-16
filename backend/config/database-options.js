"use strict";

const POOL_OPTIONS = Object.freeze({
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 4_000,
});

const INSECURE_SSL_MODES = new Set(["disable", "no-verify"]);
const LEGACY_DATABASE_KEYS = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];

function createLegacyLocalConnectionString(env) {
  const legacyConfigured = LEGACY_DATABASE_KEYS.some((key) =>
    typeof env[key] === "string" && env[key].trim() !== "",
  );
  if (!legacyConfigured) return "";
  if (env.NODE_ENV === "production") {
    throw new Error("Production PostgreSQL configuration requires DATABASE_URL");
  }

  const host = typeof env.DB_HOST === "string" ? env.DB_HOST.trim() : "";
  const normalizedHost = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(normalizedHost)) {
    throw new Error("Legacy DB_* settings are accepted only for loopback development PostgreSQL");
  }

  const database = typeof env.DB_NAME === "string" ? env.DB_NAME.trim() : "";
  const user = typeof env.DB_USER === "string" ? env.DB_USER.trim() : "";
  if (!database || !user) {
    throw new Error("Local DB_* settings require DB_HOST, DB_NAME, and DB_USER");
  }

  const port = env.DB_PORT === undefined || String(env.DB_PORT).trim() === ""
    ? 5432
    : Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DB_PORT must be a valid local PostgreSQL port number");
  }

  const urlHost = normalizedHost === "::1" ? "[::1]" : normalizedHost;
  const url = new URL(`postgresql://${urlHost}:${port}/`);
  url.username = user;
  url.password = typeof env.DB_PASSWORD === "string" ? env.DB_PASSWORD : "";
  url.pathname = `/${encodeURIComponent(database)}`;
  url.searchParams.set("sslmode", "disable");
  return url.toString();
}

function createDatabasePoolOptions(env = process.env) {
  const production = env.NODE_ENV === "production";
  let connectionString = typeof env.DATABASE_URL === "string"
    ? env.DATABASE_URL.trim()
    : "";
  let legacyLocalConfig = false;

  if (!connectionString) {
    connectionString = createLegacyLocalConnectionString(env);
    legacyLocalConfig = Boolean(connectionString);
  }

  if (!connectionString) {
    if (production) throw new Error("DATABASE_URL must be configured in production");
    return { ...POOL_OPTIONS };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsedUrl.protocol.toLowerCase()) ||
    !parsedUrl.hostname ||
    parsedUrl.pathname.length < 2
  ) {
    throw new Error("DATABASE_URL must include a PostgreSQL scheme, host, and database name");
  }

  const sslMode = (parsedUrl.searchParams.get("sslmode") || "").toLowerCase();
  const sslFlag = (parsedUrl.searchParams.get("ssl") || "").toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (production && localHosts.has(hostname)) {
    throw new Error("DATABASE_URL must not point to a loopback host in production");
  }

  if (production && INSECURE_SSL_MODES.has(sslMode)) {
    throw new Error("DATABASE_URL must use PostgreSQL TLS with certificate verification in production");
  }

  if (production && sslFlag && !["1", "true"].includes(sslFlag)) {
    throw new Error("DATABASE_URL must not disable PostgreSQL TLS in production");
  }

  if (production && parsedUrl.searchParams.get("uselibpqcompat")?.toLowerCase() === "true") {
    throw new Error("DATABASE_URL must not enable libpq SSL compatibility mode in production");
  }

  return {
    ...POOL_OPTIONS,
    connectionString,
    // Keep host/port visible to the existing local-only database scripts;
    // these values are parsed from the URL, not a second config source.
    host: hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
    // node-postgres passes this through to Node TLS; certificate validation
    // stays enabled. pg-connection-string may also parse sslmode from the URL.
    ssl: legacyLocalConfig || INSECURE_SSL_MODES.has(sslMode)
      ? false
      : { rejectUnauthorized: true },
  };
}

module.exports = { createDatabasePoolOptions };
