const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
require("dotenv").config();

const { authenticate, createAuthToken, getJwtSecret } = require("./auth");
const pool = require("./db");
const heritageRouter = require("./heritage");

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "HeritageVerse Backend is running!",
  });
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

    if (name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must be at least 2 characters",
      });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

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
       RETURNING id, name, email, created_at`,
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

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

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

    return res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
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
      "SELECT id, name, email, created_at FROM users WHERE id = $1",
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

app.use("/api", heritageRouter);

app.use((error, req, res, next) => {
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
