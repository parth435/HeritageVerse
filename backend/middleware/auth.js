const jwt = require("jsonwebtoken");
const path = require("path");
const pool = require("../config/db");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || "24h";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET must be configured");
  }

  if (
    process.env.NODE_ENV === "production" &&
    (secret.length < 32 || /replace|change-me|example/i.test(secret))
  ) {
    throw new Error("JWT_SECRET must be a non-placeholder secret of at least 32 characters in production");
  }

  return secret;
}

function createAuthToken(user) {
  const userId = Number(user?.id);

  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new Error("A valid user ID is required to create an authentication token");
  }

  return jwt.sign(
    {},
    getJwtSecret(),
    {
      algorithm: "HS256",
      subject: String(userId),
      expiresIn: TOKEN_EXPIRY,
    }
  );
}

async function authenticate(req, res, next) {
  const authorization = req.get("authorization");
  const match = typeof authorization === "string"
    ? /^Bearer\s+(\S+)$/i.exec(authorization.trim())
    : null;

  if (!match) {
    return res.status(401).json({
      success: false,
      message: authorization
        ? "Authentication token must use the Bearer scheme"
        : "Authentication token is required",
    });
  }

  let payload;
  let userId;
  try {
    payload = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ["HS256"],
    });

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid token payload");
    }

    userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new Error("Invalid token subject");
    }
  } catch {
    return res.status(401).json({
      success: false,
      message: "Authentication token is invalid or expired",
    });
  }

  try {
    const result = await pool.query(
      `SELECT COALESCE(to_jsonb(users) ->> 'role', 'user') AS role,
              COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE') AS status
         FROM users WHERE id = $1`,
      [userId],
    );
    const account = result.rows[0];
    if (!account) {
      return res.status(401).json({ success: false, message: "Authentication token is invalid or expired" });
    }

    const status = String(account.status || "ACTIVE").toUpperCase();
    if (status !== "ACTIVE") {
      return res.status(403).json({ success: false, message: "This account is not active" });
    }

    req.user = { id: userId, role: String(account.role || "user").toLowerCase(), status };
    req.auth = { userId };
    return next();
  } catch (error) {
    console.error("Session validation failed:", error.code || "unknown error");
    return res.status(503).json({ success: false, message: "Authentication is temporarily unavailable" });
  }
}

function authenticateOptional(req, res, next) {
  if (!req.get("authorization")) {
    req.user = null;
    req.auth = null;
    return next();
  }
  return authenticate(req, res, next);
}

function requireAdmin(req, res, next) {
  if (req.user?.status !== "ACTIVE" || req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Administrator access is required" });
  }
  return next();
}

module.exports = { authenticate, authenticateOptional, requireAdmin, createAuthToken, getJwtSecret };
