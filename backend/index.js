const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { authenticate, createAuthToken, getJwtSecret } = require("./middleware/auth");
const { createAttemptLimiter } = require("./middleware/rate-limit");
const { readTrustedProxyHops } = require("./middleware/trust-proxy");
const pool = require("./config/db");
const favoritesRouter = require("./modules/favorites");
const heritageRouter = require("./modules/heritage");
const visitedRouter = require("./modules/visited");
const reviewsRouter = require("./modules/reviews");
const usersRouter = require("./modules/users");
const journeysRouter = require("./modules/journeys");
const adminRouter = require("./modules/admin");
const reconstructionRouter = require("./modules/reconstruction-routes");
const routePreviewRouter = require("./modules/route-preview").createRoutePreviewRouter();

const app = express();
const configuredPort = typeof process.env.PORT === "string" ? process.env.PORT.trim() : "";
const port = configuredPort ? Number(configuredPort) : 5000;
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port number");
}
app.set("trust proxy", readTrustedProxyHops());

const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production") {
  if (!corsOrigins.length) throw new Error("CORS_ORIGIN must be configured in production");
}

const allowedOrigins = corsOrigins.length
  ? corsOrigins
  : ["http://localhost:5173", "http://127.0.0.1:5173"];

if (process.env.NODE_ENV === "production") {
  for (const origin of allowedOrigins) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error("CORS_ORIGIN must contain exact HTTPS origins in production");
    }
    if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== origin) {
      throw new Error("CORS_ORIGIN must contain exact HTTPS origins in production");
    }
  }
}

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.includes(origin));
  },
}));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "100kb" }));

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginLimiter = createAttemptLimiter({ windowMs: LOGIN_WINDOW_MS, limit: 10, maxKeys: 5000 });
const signupLimiter = createAttemptLimiter({ windowMs: LOGIN_WINDOW_MS, limit: 10, maxKeys: 5000 });

function rateLimited(res, retryAfter, action) {
  if (!retryAfter) return false;
  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({ success: false, message: `Too many ${action} attempts. Try again later.` });
  return true;
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "HeritageVerse Backend is running!",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
  });
});

app.get("/readyz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ success: true, status: "ready" });
  } catch (error) {
    console.error("Readiness check failed:", error.code || "unknown error");
    return res.status(503).json({ success: false, status: "not_ready" });
  }
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      success: true,
      message: "PostgreSQL connected successfully!",
      time: result.rows[0],
    });
  } catch (error) {
    console.error("Database health check failed:", error.code || "unknown error");

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (name.length < 2 || Buffer.byteLength(name, "utf8") > 120) {
      return res.status(400).json({
        success: false,
        message: "Name must be between 2 and 120 characters",
      });
    }

    if (Buffer.byteLength(email, "utf8") > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    const passwordBytes = Buffer.byteLength(password, "utf8");
    if (password.length < 8 || passwordBytes > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and no more than 72 UTF-8 bytes",
      });
    }

    const rateKey = req.ip || req.socket?.remoteAddress || "unknown";
    if (rateLimited(res, signupLimiter.check(rateKey), "sign-up")) return;

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email,
                 COALESCE(to_jsonb(users) ->> 'role', 'user') AS role,
                 COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE') AS status,
                 created_at`,
      [name, email, passwordHash]
    );

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: result.rows[0],
      token: createAuthToken(result.rows[0]),
    });
  } catch (error) {
    console.error("Signup failed:", error.code || "unknown error");

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create account",
    });
  }
});

app.post("/api/auth/signin", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password || Buffer.byteLength(email, "utf8") > 254 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const rateKey = req.ip || req.socket?.remoteAddress || "unknown";
    if (rateLimited(res, loginLimiter.check(rateKey), "sign-in")) return;

    const result = await pool.query(
      `SELECT id, name, email, password_hash,
              COALESCE(to_jsonb(users) ->> 'role', 'user') AS role,
              COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE') AS status
         FROM users WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Compare entered password with hashed password
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const status = String(user.status || "ACTIVE").toUpperCase();
    if (status !== "ACTIVE") {
      return res.status(403).json({ success: false, message: "This account is not active" });
    }

    loginLimiter.reset(rateKey);

    return res.json({
      success: true,
      message: "Login successful",
      user: {
        id: Number(user.id) || user.id,
        name: user.name,
        email: user.email,
        role: String(user.role || "user").toLowerCase(),
        status,
      },
      token: createAuthToken(user),
    });
  } catch (error) {
    console.error("Signin failed:", error.code || "unknown error");

    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email,
              COALESCE(to_jsonb(users) ->> 'role', 'user') AS role,
              COALESCE(to_jsonb(users) ->> 'status', 'ACTIVE') AS status,
              created_at
         FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User account was not found",
      });
    }

    return res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Current user lookup failed:", error.code || "unknown error");

    return res.status(500).json({
      success: false,
      message: "Failed to load the current user",
    });
  }
});

app.use("/api", favoritesRouter);
app.use("/api", visitedRouter);
app.use("/api", reviewsRouter);
app.use("/api", usersRouter);
app.use("/api", journeysRouter);
app.use("/api", routePreviewRouter);
app.use("/api", adminRouter);
app.use("/api", heritageRouter);
app.use("/api", reconstructionRouter);

app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body is too large",
    });
  }

  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      success: false,
      message: "Request body must be valid JSON",
    });
  }

  console.error("Unhandled request error:", error.status || "unknown error");
  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

getJwtSecret();

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});

let shutdownStarted = false;
function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Received ${signal}; closing HTTP server`);

  const timeout = setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  timeout.unref();

  server.close(async (serverError) => {
    if (serverError) {
      console.error("HTTP server shutdown failed:", serverError.code || "unknown error");
      process.exitCode = 1;
    }

    try {
      await pool.end();
    } catch (error) {
      console.error("PostgreSQL pool shutdown failed:", error.code || "unknown error");
      process.exitCode = 1;
    }

    clearTimeout(timeout);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
