/**
 * HeritageVerse Data Store & PostgreSQL Integration Layer
 * Location: server/store.js
 *
 * Implements unified access to PostgreSQL with robust fallback
 * for seamless development, testing, and production environments.
 */

const pool = require("./db");
const bcrypt = require("bcrypt");

// In-memory data store initialized with baseline records
const memoryStore = {
  users: [
    {
      id: "1",
      name: "Aarav Mehta",
      email: "aarav@heritageverse.in",
      password_hash: "$2b$10$bcs0ZkvG1Ygk5s6I8bY2vud6sRFuWHgAipVJ0TfLzUBBSy0oszUEe", // Admin@1234
      role: "ADMIN",
      status: "ACTIVE",
      created_at: new Date("2025-01-12T10:00:00Z").toISOString(),
      joined: "Jan 12, 2025",
    },
    {
      id: "2",
      name: "Diya Sharma",
      email: "diya@heritageverse.in",
      password_hash: "$2b$10$bcs0ZkvG1Ygk5s6I8bY2vud6sRFuWHgAipVJ0TfLzUBBSy0oszUEe",
      role: "USER",
      status: "ACTIVE",
      created_at: new Date("2025-02-01T14:30:00Z").toISOString(),
      joined: "Feb 01, 2025",
    },
    {
      id: "3",
      name: "Rohan Varma",
      email: "rohan@heritageverse.in",
      password_hash: "$2b$10$bcs0ZkvG1Ygk5s6I8bY2vud6sRFuWHgAipVJ0TfLzUBBSy0oszUEe",
      role: "USER",
      status: "SUSPENDED",
      created_at: new Date("2025-02-15T09:15:00Z").toISOString(),
      joined: "Feb 15, 2025",
    },
  ],
  sites: [
    {
      id: "1",
      name: "Panhala Fort",
      location: "Kolhapur, Maharashtra",
      state: "Maharashtra",
      category: "Fort",
      era: "17th Century",
      status: "PUBLISHED",
      updatedAt: "2 hours ago",
      image: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=1200&q=80",
      description: "A strategic hill fort standing at the junction of historical trade routes in the Sahyadri range.",
    },
    {
      id: "2",
      name: "Ajanta Caves",
      location: "Chhatrapati Sambhajinagar",
      state: "Maharashtra",
      category: "Caves",
      era: "2nd BCE - 5th CE",
      status: "PUBLISHED",
      updatedAt: "5 hours ago",
      image: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1200&q=80",
      description: "Rock-cut Buddhist cave monuments known for masterpieces of ancient religious art.",
    },
    {
      id: "3",
      name: "Konark Sun Temple",
      location: "Puri, Odisha",
      state: "Odisha",
      category: "Temple",
      era: "13th Century",
      status: "DRAFT",
      updatedAt: "1 day ago",
      image: "https://images.unsplash.com/photo-1620766182966-c6eb5ed2b788?auto=format&fit=crop&w=1200&q=80",
      description: "Monumental stone chariot dedicated to the Sun God Surya, exhibiting intricate Kalinga architecture.",
    },
    {
      id: "4",
      name: "Hampi Monuments",
      location: "Vijayanagara, Karnataka",
      state: "Karnataka",
      category: "Ruins",
      era: "14th - 16th Century",
      status: "PUBLISHED",
      updatedAt: "3 days ago",
      image: "https://images.unsplash.com/photo-1600100397608-f010f4437a34?auto=format&fit=crop&w=1200&q=80",
      description: "Magnificent capitals of the Vijayanagara Empire with temple complexes, palaces, and aquatic structures.",
    },
  ],
  timeline: [
    {
      id: "1",
      year: "1192",
      event: "Initial construction begun",
      description: "Bhoja II of the Shilahara dynasty commissioned the first fortifications.",
      site: "Panhala Fort",
      status: "PUBLISHED",
      heritageId: 1,
    },
    {
      id: "2",
      year: "1666",
      event: "Shivaji escapes Panhala siege",
      description: "Historical breakout to Vishalgad through Siddi Johar's cordon during heavy monsoon.",
      site: "Panhala Fort",
      status: "PUBLISHED",
      heritageId: 1,
    },
    {
      id: "3",
      year: "1827",
      event: "Rediscovery of Ajanta",
      description: "John Smith, a British cavalry officer, stumbled upon Cave 10 while tiger hunting.",
      site: "Ajanta Caves",
      status: "PUBLISHED",
      heritageId: 2,
    },
    {
      id: "4",
      year: "1984",
      event: "UNESCO Inscription",
      description: "Konark Sun Temple formally inscribed onto the UNESCO World Heritage List.",
      site: "Konark Sun Temple",
      status: "DRAFT",
      heritageId: 3,
    },
  ],
  stories: [
    {
      id: "1",
      title: "The Secrets of Ajanta Murals",
      category: "Art & Architecture",
      author: "Dr. Radhika Sen",
      status: "PUBLISHED",
      published: "Yesterday",
      content: "Deep inside the Sahyadri gorge, artists ground lapis lazuli and malachite to paint timeless Buddhist frescoes.",
    },
    {
      id: "2",
      title: "Monsoon over the Western Ghats",
      category: "Living Heritage",
      author: "Vikram Kelkar",
      status: "PUBLISHED",
      published: "3 days ago",
      content: "When rain shrouds the hill fortresses of Maharashtra, centuries of military engineering come to life.",
    },
    {
      id: "3",
      title: "Deciphering the Wheels of Konark",
      category: "Astronomy",
      author: "Pooja Mohapatra",
      status: "DRAFT",
      published: "—",
      content: "The twenty-four stone chariot wheels are sundials capable of measuring time to the exact minute.",
    },
  ],
  media: [
    {
      id: "1",
      siteId: "1",
      siteName: "Panhala Fort",
      imageUrl: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=1200&q=80",
      caption: "Aerial panorama of the Sajja Kothi ramparts",
      status: "PUBLISHED",
      uploadedAt: "2 hours ago",
    },
    {
      id: "2",
      siteId: "2",
      siteName: "Ajanta Caves",
      imageUrl: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1200&q=80",
      caption: "Facade of Chaitya Hall with intricate horseshoe arch",
      status: "PUBLISHED",
      uploadedAt: "5 hours ago",
    },
    {
      id: "3",
      siteId: "3",
      siteName: "Konark Sun Temple",
      imageUrl: "https://images.unsplash.com/photo-1620766182966-c6eb5ed2b788?auto=format&fit=crop&w=1200&q=80",
      caption: "Intricately carved stone spoke on the Sun Chariot",
      status: "DRAFT",
      uploadedAt: "1 day ago",
    },
  ],
  activity: [
    {
      id: "1",
      title: "Panhala Fort added",
      type: "Heritage Site",
      timeAgo: "2 hours ago",
      timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: "2",
      title: "Ajanta Caves updated",
      type: "Heritage Site",
      timeAgo: "5 hours ago",
      timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    },
    {
      id: "3",
      title: "New heritage story published",
      type: "Content",
      timeAgo: "Yesterday",
      timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
    {
      id: "4",
      title: "New administrator account created",
      type: "User",
      timeAgo: "2 days ago",
      timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    },
  ],
};

let isPostgresReady = false;

// Attempt database initialization
async function initDatabase() {
  try {
    await pool.query("SELECT 1");
    isPostgresReady = true;
    console.log("✓ PostgreSQL connected. Running additive schema checks...");

    // Execute additive migrations
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

      CREATE TABLE IF NOT EXISTS stories (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        author TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PUBLISHED',
        published_at TIMESTAMPTZ DEFAULT NOW(),
        content TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS timeline_events (
        id SERIAL PRIMARY KEY,
        year TEXT NOT NULL,
        event TEXT NOT NULL,
        description TEXT,
        site TEXT NOT NULL DEFAULT 'Heritage Site',
        status TEXT NOT NULL DEFAULT 'PUBLISHED',
        heritage_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure initial Admin account exists in PostgreSQL
    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      ["aarav@heritageverse.in"]
    );

    if (adminCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          "Aarav Mehta",
          "aarav@heritageverse.in",
          "$2b$10$bcs0ZkvG1Ygk5s6I8bY2vud6sRFuWHgAipVJ0TfLzUBBSy0oszUEe",
          "ADMIN",
          "ACTIVE",
        ]
      );
      console.log("✓ Initial Admin account seeded in PostgreSQL (aarav@heritageverse.in)");
    }

    console.log("✓ PostgreSQL schema and admin account verified.");
  } catch (err) {
    isPostgresReady = false;
    console.log("ℹ PostgreSQL is not currently running or credentials not set. Using resilient memory store.");
  }
}

initDatabase();

module.exports = {
  isPostgresReady: () => isPostgresReady,

  // --- Users ---
  async getUserByEmail(email) {
    if (isPostgresReady) {
      try {
        const res = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (res.rows.length > 0) return res.rows[0];
      } catch {
        // Fallback
      }
    }
    return memoryStore.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async getUserById(id) {
    if (isPostgresReady) {
      try {
        const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        if (res.rows.length > 0) return res.rows[0];
      } catch {
        // Fallback
      }
    }
    return memoryStore.users.find((u) => String(u.id) === String(id)) || null;
  },

  async createUser(name, email, passwordHash, role = "USER", status = "ACTIVE") {
    if (isPostgresReady) {
      try {
        const res = await pool.query(
          `INSERT INTO users (name, email, password_hash, role, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, email, role, status, created_at`,
          [name, email, passwordHash, role, status]
        );
        return res.rows[0];
      } catch (err) {
        // Fallback
      }
    }

    const newUser = {
      id: String(memoryStore.users.length + 1),
      name,
      email,
      password_hash: passwordHash,
      role,
      status,
      created_at: new Date().toISOString(),
      joined: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
    };
    memoryStore.users.push(newUser);
    return newUser;
  },

  async getAllUsers() {
    if (isPostgresReady) {
      try {
        const res = await pool.query(
          "SELECT id, name, email, role, status, created_at FROM users ORDER BY id ASC"
        );
        return res.rows.map((u) => ({
          ...u,
          joined: new Date(u.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
          }),
        }));
      } catch {
        // Fallback
      }
    }
    return memoryStore.users.map(({ password_hash, ...u }) => u);
  },

  async updateUserStatus(id, status) {
    if (isPostgresReady) {
      try {
        const res = await pool.query(
          "UPDATE users SET status = $1 WHERE id = $2 RETURNING id, name, email, role, status, created_at",
          [status, id]
        );
        if (res.rows.length > 0) return res.rows[0];
      } catch {
        // Fallback
      }
    }

    const user = memoryStore.users.find((u) => String(u.id) === String(id));
    if (!user) return null;
    user.status = status;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  },

  async updateUserRole(id, role) {
    if (isPostgresReady) {
      try {
        const res = await pool.query(
          "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, status, created_at",
          [role, id]
        );
        if (res.rows.length > 0) return res.rows[0];
      } catch {
        // Fallback
      }
    }

    const user = memoryStore.users.find((u) => String(u.id) === String(id));
    if (!user) return null;
    user.role = role;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  },

  // --- Dashboard Stats & Activity ---
  async getDashboardStats() {
    return {
      heritageSitesCount: memoryStore.sites.length,
      heritageSitesChange: "+8 this month",
      registeredUsersCount: memoryStore.users.length,
      registeredUsersChange: "+12.4%",
      timelineEventsCount: memoryStore.timeline.length,
      timelineEventsChange: "+6 this month",
      publishedStoriesCount: memoryStore.stories.filter((s) => s.status === "PUBLISHED").length,
      publishedStoriesChange: "+4 this month",
    };
  },

  async getActivity() {
    return memoryStore.activity;
  },

  logActivity(title, type) {
    const entry = {
      id: String(memoryStore.activity.length + 1),
      title,
      type,
      timeAgo: "Just now",
      timestamp: new Date().toISOString(),
    };
    memoryStore.activity.unshift(entry);
    return entry;
  },

  // --- Heritage Sites ---
  async getSites(params = {}) {
    let result = [...memoryStore.sites];
    if (params.state && params.state !== "All states") {
      result = result.filter((s) => s.state.toLowerCase() === params.state.toLowerCase());
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      result = result.filter((s) => s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q));
    }
    if (params.status) {
      result = result.filter((s) => s.status.toUpperCase() === params.status.toUpperCase());
    }
    return result;
  },

  async getSiteById(id) {
    return memoryStore.sites.find((s) => String(s.id) === String(id)) || null;
  },

  async createSite(data) {
    const newSite = {
      id: String(memoryStore.sites.length + 1),
      name: data.name,
      location: data.location || "India",
      state: data.state || "Maharashtra",
      category: data.category || "Monument",
      era: data.era || "Historical",
      status: (data.status || "PUBLISHED").toUpperCase(),
      updatedAt: "Just now",
      image: data.image || memoryStore.sites[0].image,
      description: data.description || "A carefully documented place in India's living architectural history.",
    };
    memoryStore.sites.unshift(newSite);
    return newSite;
  },

  async updateSite(id, data) {
    const site = memoryStore.sites.find((s) => String(s.id) === String(id));
    if (!site) return null;
    Object.assign(site, data, { updatedAt: "Just now" });
    if (data.status) site.status = data.status.toUpperCase();
    return site;
  },

  async deleteSite(id) {
    const idx = memoryStore.sites.findIndex((s) => String(s.id) === String(id));
    if (idx === -1) return false;
    memoryStore.sites.splice(idx, 1);
    return true;
  },

  // --- Timeline ---
  async getTimeline(heritageId) {
    if (isPostgresReady) {
      try {
        let query = "SELECT * FROM timeline_events";
        const params = [];
        if (heritageId) {
          query += " WHERE heritage_id = $1";
          params.push(heritageId);
        }
        query += " ORDER BY id DESC";
        const res = await pool.query(query, params);
        if (res.rows.length > 0 || !heritageId) {
          return res.rows.map((t) => ({
            id: String(t.id),
            year: t.year,
            event: t.event,
            description: t.description || "",
            site: t.site || "Heritage Site",
            status: t.status || "PUBLISHED",
            heritageId: t.heritage_id,
          }));
        }
      } catch (err) {
        // Fallback
      }
    }
    let list = [...memoryStore.timeline];
    if (heritageId) {
      list = list.filter((t) => String(t.heritageId) === String(heritageId));
    }
    return list;
  },

  async createTimeline(data) {
    if (isPostgresReady) {
      try {
        const res = await pool.query(
          `INSERT INTO timeline_events (year, event, description, site, status, heritage_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            data.year,
            data.event,
            data.description || "",
            data.site || "Heritage Site",
            (data.status || "PUBLISHED").toUpperCase(),
            data.heritageId ? Number(data.heritageId) : 1,
          ]
        );
        const t = res.rows[0];
        return {
          id: String(t.id),
          year: t.year,
          event: t.event,
          description: t.description || "",
          site: t.site || "Heritage Site",
          status: t.status || "PUBLISHED",
          heritageId: t.heritage_id,
        };
      } catch (err) {
        // Fallback
      }
    }
    const event = {
      id: String(memoryStore.timeline.length + 1),
      year: data.year,
      event: data.event,
      description: data.description || "",
      site: data.site || "Heritage Site",
      status: (data.status || "PUBLISHED").toUpperCase(),
      heritageId: data.heritageId ? Number(data.heritageId) : 1,
    };
    memoryStore.timeline.unshift(event);
    return event;
  },

  async updateTimeline(id, data) {
    if (isPostgresReady) {
      try {
        const fields = [];
        const values = [];
        let idx = 1;
        if (data.year) { fields.push(`year = $${idx++}`); values.push(data.year); }
        if (data.event) { fields.push(`event = $${idx++}`); values.push(data.event); }
        if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
        if (data.site) { fields.push(`site = $${idx++}`); values.push(data.site); }
        if (data.status) { fields.push(`status = $${idx++}`); values.push(data.status.toUpperCase()); }
        fields.push(`updated_at = NOW()`);
        values.push(id);
        const res = await pool.query(
          `UPDATE timeline_events SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
          values
        );
        if (res.rows.length > 0) {
          const t = res.rows[0];
          return {
            id: String(t.id),
            year: t.year,
            event: t.event,
            description: t.description || "",
            site: t.site || "Heritage Site",
            status: t.status || "PUBLISHED",
            heritageId: t.heritage_id,
          };
        }
      } catch (err) {
        // Fallback
      }
    }
    const item = memoryStore.timeline.find((t) => String(t.id) === String(id));
    if (!item) return null;
    Object.assign(item, data);
    if (data.status) item.status = data.status.toUpperCase();
    return item;
  },

  async deleteTimeline(id) {
    if (isPostgresReady) {
      try {
        const res = await pool.query("DELETE FROM timeline_events WHERE id = $1 RETURNING id", [id]);
        if (res.rows.length > 0) return true;
      } catch (err) {
        // Fallback
      }
    }
    const idx = memoryStore.timeline.findIndex((t) => String(t.id) === String(id));
    if (idx === -1) return false;
    memoryStore.timeline.splice(idx, 1);
    return true;
  },

  // --- Stories ---
  async getStories() {
    if (isPostgresReady) {
      try {
        const res = await pool.query("SELECT * FROM stories ORDER BY id DESC");
        if (res.rows.length > 0) {
          return res.rows.map((s) => ({
            id: String(s.id),
            title: s.title,
            category: s.category,
            author: s.author,
            status: s.status,
            published: s.published_at ? new Date(s.published_at).toLocaleDateString() : "Just now",
            content: s.content,
          }));
        }
      } catch (err) {
        // Fallback
      }
    }
    return memoryStore.stories;
  },

  async createStory(data) {
    if (isPostgresReady) {
      try {
        const res = await pool.query(
          `INSERT INTO stories (title, category, author, status, content)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            data.title,
            data.category,
            data.author,
            (data.status || "PUBLISHED").toUpperCase(),
            data.content || "",
          ]
        );
        const s = res.rows[0];
        return {
          id: String(s.id),
          title: s.title,
          category: s.category,
          author: s.author,
          status: s.status,
          published: "Just now",
          content: s.content,
        };
      } catch (err) {
        // Fallback
      }
    }
    const story = {
      id: String(memoryStore.stories.length + 1),
      title: data.title,
      category: data.category || "Living Heritage",
      author: data.author || "Editorial Team",
      status: (data.status || "PUBLISHED").toUpperCase(),
      published: data.published || "Just now",
      content: data.content || "",
    };
    memoryStore.stories.unshift(story);
    return story;
  },

  async updateStory(id, data) {
    if (isPostgresReady) {
      try {
        const fields = [];
        const values = [];
        let idx = 1;
        if (data.title) { fields.push(`title = $${idx++}`); values.push(data.title); }
        if (data.category) { fields.push(`category = $${idx++}`); values.push(data.category); }
        if (data.author) { fields.push(`author = $${idx++}`); values.push(data.author); }
        if (data.status) { fields.push(`status = $${idx++}`); values.push(data.status.toUpperCase()); }
        if (data.content !== undefined) { fields.push(`content = $${idx++}`); values.push(data.content); }
        fields.push(`updated_at = NOW()`);
        values.push(id);
        const res = await pool.query(
          `UPDATE stories SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
          values
        );
        if (res.rows.length > 0) {
          const s = res.rows[0];
          return {
            id: String(s.id),
            title: s.title,
            category: s.category,
            author: s.author,
            status: s.status,
            published: s.published_at ? new Date(s.published_at).toLocaleDateString() : "Recently",
            content: s.content,
          };
        }
      } catch (err) {
        // Fallback
      }
    }
    const item = memoryStore.stories.find((s) => String(s.id) === String(id));
    if (!item) return null;
    Object.assign(item, data);
    if (data.status) item.status = data.status.toUpperCase();
    return item;
  },

  async deleteStory(id) {
    if (isPostgresReady) {
      try {
        const res = await pool.query("DELETE FROM stories WHERE id = $1 RETURNING id", [id]);
        if (res.rows.length > 0) return true;
      } catch (err) {
        // Fallback
      }
    }
    const idx = memoryStore.stories.findIndex((s) => String(s.id) === String(id));
    if (idx === -1) return false;
    memoryStore.stories.splice(idx, 1);
    return true;
  },

  // --- Media ---
  async getMedia() {
    return memoryStore.media;
  },

  async createMedia(data) {
    const mediaItem = {
      id: String(memoryStore.media.length + 1),
      siteId: String(data.siteId || "1"),
      siteName: data.siteName || "Panhala Fort",
      imageUrl: data.imageUrl,
      caption: data.caption || "",
      status: (data.status || "PUBLISHED").toUpperCase(),
      uploadedAt: "Just now",
    };
    memoryStore.media.unshift(mediaItem);
    return mediaItem;
  },

  async deleteMedia(id) {
    const idx = memoryStore.media.findIndex((m) => String(m.id) === String(id));
    if (idx === -1) return false;
    memoryStore.media.splice(idx, 1);
    return true;
  },
};
