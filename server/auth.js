const jwt = require("jsonwebtoken");

const TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || "24h";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET must be configured");
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

function authenticate(req, res, next) {
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

  try {
    const payload = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ["HS256"],
    });

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid token payload");
    }

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new Error("Invalid token subject");
    }

    req.user = { id: userId };
    req.auth = { userId };
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Authentication token is invalid or expired",
    });
  }
}

module.exports = { authenticate, createAuthToken, getJwtSecret };
