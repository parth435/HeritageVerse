const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { createDatabasePoolOptions } = require("./database-options");

const pool = new Pool(createDatabasePoolOptions());

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.code || "unknown error");
});

module.exports = pool;
