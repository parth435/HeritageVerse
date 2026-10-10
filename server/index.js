const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const pool = require("./db");
const store = require("./store");

const app = express();

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || "heritageverse-super-secret-jwt-key-2026";
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// =========================================================================
// AUTHORIZATION MIDDLEWARE
// =========================================================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please sign in.",
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Administrator privileges required.",
    });
  }
  next();
}

// =========================================================================
// HEALTH & DIAGNOSTIC ENDPOINTS
// =========================================================================

app.get("/", (req, res) => {
  res.json({
    message: "HeritageVerse Backend is running!",
    postgresConnected: store.isPostgresReady(),
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
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      fallbackActive: true,
    });
  }
});

// =========================================================================
// AUTHENTICATION APIs
// =========================================================================

// SIGN UP API
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    const existingUser = await store.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const role = email.toLowerCase() === "aarav@heritageverse.in" ? "ADMIN" : "USER";
    const status = "ACTIVE";

    const user = await store.createUser(name, email, passwordHash, role, status);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create account",
    });
  }
});

// SIGN IN API
app.post("/api/auth/signin", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await store.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact administrator.",
      });
    }

    const role = user.role || (email.toLowerCase() === "aarav@heritageverse.in" ? "ADMIN" : "USER");

    const token = jwt.sign(
      { id: user.id, email: user.email, role, name: user.name },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
        status: user.status || "ACTIVE",
      },
    });
  } catch (error) {
    console.error("Signin error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

// =========================================================================
// ADMIN APIs (PROTECTED BY authenticateToken + requireAdmin)
// =========================================================================

// 1. GET /api/admin/stats
app.get("/api/admin/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await store.getDashboardStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve admin stats" });
  }
});

// 2. GET /api/admin/activity
app.get("/api/admin/activity", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const activity = await store.getActivity();
    res.json({
      success: true,
      data: activity,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve activity log" });
  }
});

// 3. GET /api/admin/sites
app.get("/api/admin/sites", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sites = await store.getSites(req.query);
    res.json({
      success: true,
      data: sites,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve heritage sites" });
  }
});

// 4. POST /api/admin/sites
app.post("/api/admin/sites", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, location, state, category, era, status, description, image } = req.body;
    if (!name || !state || !category) {
      return res.status(400).json({
        success: false,
        message: "Site name, state, and category are required",
      });
    }

    const newSite = await store.createSite({
      name,
      location,
      state,
      category,
      era,
      status,
      description,
      image,
    });

    store.logActivity(`${newSite.name} added`, "Heritage Site");

    res.status(201).json({
      success: true,
      message: "Heritage site created successfully",
      data: newSite,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create heritage site" });
  }
});

// 5. PUT /api/admin/sites/:id
app.put("/api/admin/sites/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const updated = await store.updateSite(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Heritage site not found",
      });
    }

    store.logActivity(`${updated.name} updated`, "Heritage Site");

    res.json({
      success: true,
      message: "Heritage site updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update heritage site" });
  }
});

// 6. DELETE /api/admin/sites/:id
app.delete("/api/admin/sites/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const site = await store.getSiteById(req.params.id);
    const deleted = await store.deleteSite(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Heritage site not found",
      });
    }

    store.logActivity(`${site ? site.name : "Heritage site"} removed`, "Heritage Site");

    res.json({
      success: true,
      message: "Heritage site deleted successfully",
      data: { id: req.params.id },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete heritage site" });
  }
});

// 7. GET /api/admin/timeline
app.get("/api/admin/timeline", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const events = await store.getTimeline(req.query.heritageId);
    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve timeline events" });
  }
});

// 8. POST /api/admin/timeline
app.post("/api/admin/timeline", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { year, event, description, site, status, heritageId } = req.body;
    if (!year || !event) {
      return res.status(400).json({
        success: false,
        message: "Year and event title are required",
      });
    }

    const newEvent = await store.createTimeline({
      year,
      event,
      description,
      site,
      status,
      heritageId,
    });

    store.logActivity(`Timeline event added: ${event}`, "Content");

    res.status(201).json({
      success: true,
      message: "Timeline event created successfully",
      data: newEvent,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create timeline event" });
  }
});

// 9. PUT /api/admin/timeline/:id
app.put("/api/admin/timeline/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const updated = await store.updateTimeline(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Timeline event not found",
      });
    }

    store.logActivity(`Timeline event updated: ${updated.event}`, "Content");

    res.json({
      success: true,
      message: "Timeline event updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update timeline event" });
  }
});

// 10. DELETE /api/admin/timeline/:id
app.delete("/api/admin/timeline/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deleted = await store.deleteTimeline(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Timeline event not found",
      });
    }

    store.logActivity(`Timeline event removed`, "Content");

    res.json({
      success: true,
      message: "Timeline event deleted successfully",
      data: { id: req.params.id },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete timeline event" });
  }
});

// 11. GET /api/admin/stories
app.get("/api/admin/stories", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stories = await store.getStories();
    res.json({
      success: true,
      data: stories,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve stories" });
  }
});

// 12. POST /api/admin/stories
app.post("/api/admin/stories", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, category, author, status, published, content } = req.body;
    if (!title || !category || !author) {
      return res.status(400).json({
        success: false,
        message: "Title, category, and author are required",
      });
    }

    const newStory = await store.createStory({
      title,
      category,
      author,
      status,
      published,
      content,
    });

    store.logActivity(`Story published: ${title}`, "Content");

    res.status(201).json({
      success: true,
      message: "Story created successfully",
      data: newStory,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create story" });
  }
});

// 13. PUT /api/admin/stories/:id
app.put("/api/admin/stories/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const updated = await store.updateStory(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    store.logActivity(`Story updated: ${updated.title}`, "Content");

    res.json({
      success: true,
      message: "Story updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update story" });
  }
});

// 14. DELETE /api/admin/stories/:id
app.delete("/api/admin/stories/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deleted = await store.deleteStory(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    store.logActivity(`Story removed`, "Content");

    res.json({
      success: true,
      message: "Story deleted successfully",
      data: { id: req.params.id },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete story" });
  }
});

// 15. GET /api/admin/users
app.get("/api/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await store.getAllUsers();
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve users" });
  }
});

// 16. PATCH /api/admin/users/:id/status
app.patch("/api/admin/users/:id/status", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !["ACTIVE", "SUSPENDED"].includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'ACTIVE' or 'SUSPENDED'",
      });
    }

    const updated = await store.updateUserStatus(req.params.id, status.toUpperCase());
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    store.logActivity(`User status changed: ${updated.name} -> ${status}`, "User");

    res.json({
      success: true,
      message: "User status updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update user status" });
  }
});

// 17. PATCH /api/admin/users/:id/role
app.patch("/api/admin/users/:id/role", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!role || !["USER", "ADMIN"].includes(role.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Role must be either 'USER' or 'ADMIN'",
      });
    }

    const updated = await store.updateUserRole(req.params.id, role.toUpperCase());
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    store.logActivity(`User role changed: ${updated.name} -> ${role}`, "User");

    res.json({
      success: true,
      message: "User role updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update user role" });
  }
});

// 18. GET /api/admin/media
app.get("/api/admin/media", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const media = await store.getMedia();
    res.json({
      success: true,
      data: media,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve media library" });
  }
});

// 19. POST /api/admin/media
app.post("/api/admin/media", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { siteId, imageUrl, caption, altText, mediaType, status } = req.body;
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: "Image URL is required",
      });
    }

    const newMedia = await store.createMedia({
      siteId,
      imageUrl,
      caption,
      altText,
      mediaType,
      status,
    });

    store.logActivity(`Media reference added`, "Content");

    res.status(201).json({
      success: true,
      message: "Media reference created successfully",
      data: newMedia,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to add media reference" });
  }
});

// 20. DELETE /api/admin/media/:id
app.delete("/api/admin/media/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deleted = await store.deleteMedia(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Media reference not found",
      });
    }

    store.logActivity(`Media reference deleted`, "Content");

    res.json({
      success: true,
      message: "Media reference deleted successfully",
      data: { id: req.params.id },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete media reference" });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`✓ HeritageVerse Server running on port ${PORT}`);
});

module.exports = { app, server };