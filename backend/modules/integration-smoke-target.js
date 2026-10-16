"use strict";

const crypto = require("node:crypto");
const express = require("express");
const {
  EXPECTED_SMOKE_DATABASE,
  isLoopbackAddress,
  isSafeEnvironment,
  validateDatabaseIdentity,
} = require("../config/integration-smoke-safety");

const TARGET_SQL = `
  SELECT current_database() AS database_name,
         current_schema() AS schema_name,
         inet_server_addr()::text AS server_address,
         inet_server_port() AS server_port
`;

function sameSecret(expected, supplied) {
  if (typeof expected !== "string" || typeof supplied !== "string") return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length >= 32 && expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

function createIntegrationSmokeTargetRouter({ pool, env = process.env } = {}) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL pool is required.");
  const router = express.Router();

  router.get("/__integration-smoke/target", async (req, res) => {
    const expectedToken = typeof env.HERITAGEVERSE_SMOKE_TARGET_TOKEN === "string"
      ? env.HERITAGEVERSE_SMOKE_TARGET_TOKEN
      : "";
    const suppliedToken = req.get("x-heritageverse-smoke-token");
    if (!isSafeEnvironment(env.NODE_ENV) || !sameSecret(expectedToken, suppliedToken)) {
      return res.status(404).json({ success: false, code: "SMOKE_TARGET_UNAVAILABLE" });
    }
    if (!isLoopbackAddress(req.socket?.remoteAddress)) {
      return res.status(403).json({ success: false, code: "SMOKE_TARGET_LOCAL_ONLY" });
    }

    try {
      const result = await pool.query(TARGET_SQL);
      const databaseTarget = validateDatabaseIdentity({
        databaseName: result.rows?.[0]?.database_name,
        schemaName: result.rows?.[0]?.schema_name,
        serverAddress: result.rows?.[0]?.server_address,
        serverPort: result.rows?.[0]?.server_port,
      });
      if (databaseTarget.databaseName !== EXPECTED_SMOKE_DATABASE) {
        return res.status(403).json({ success: false, code: "SMOKE_TARGET_UNSAFE" });
      }
      return res.json({ success: true, environment: env.NODE_ENV, databaseTarget });
    } catch {
      return res.status(403).json({ success: false, code: "SMOKE_TARGET_UNSAFE" });
    }
  });

  return router;
}

module.exports = { TARGET_SQL, createIntegrationSmokeTargetRouter, sameSecret };
