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
  return jwt.sign(
    { email: user.email, name: user.name },
    getJwtSecret(),
    {
      subject: String(user.id),
      expiresIn: TOKEN_EXPIRY,
    }
  );
}

function authenticate(req, res, next) {
  const authorization = req.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new Error("Invalid token subject");
    }

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
