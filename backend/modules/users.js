const express = require("express");
const { authenticate } = require("../middleware/auth");
const pool = require("../config/db");
const { readText } = require("../middleware/validation");

const router = express.Router();

router.get("/users/me", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email, COALESCE(to_jsonb(users) ->> 'role', 'user') AS role, created_at FROM users WHERE id = $1", [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "User account was not found" });
    return res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("Profile lookup failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to load profile" });
  }
});

router.patch("/users/me", authenticate, async (req, res) => {
  const name = readText(req.body?.name, { required: true, maximum: 120 });
  if (!name || name.length < 2) return res.status(400).json({ success: false, message: "Name must be between 2 and 120 characters" });
  try {
    const result = await pool.query("UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, COALESCE(to_jsonb(users) ->> 'role', 'user') AS role, created_at", [name, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "User account was not found" });
    return res.json({ success: true, message: "Profile updated", user: result.rows[0] });
  } catch (error) {
    console.error("Profile update failed:", error.code || "unknown error");
    return res.status(500).json({ success: false, message: "Failed to update profile" });
  }
});

module.exports = router;
