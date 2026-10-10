/**
 * HeritageVerse Backend Test Suite
 * Location: server/test-suite.js
 *
 * Comprehensive integration tests for authentication, JWT verification,
 * RBAC authorization, and all 20 Admin REST APIs.
 */

const http = require("http");

// Helper to make HTTP requests
function apiRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      "Content-Type": "application/json",
    };
    if (data) {
      headers["Content-Length"] = Buffer.byteLength(data);
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: "localhost",
        port: 5000,
        path,
        method,
        headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { raw };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log("\n==================================================");
  console.log("HERITAGEVERSE BACKEND & ADMIN INTEGRATION TEST SUITE");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    console.log("[1] Health Check");
    const health = await apiRequest("GET", "/");
    assert(health.status === 200 && health.body.message, "GET / responds with status 200");

    // 2. Auth: User Signup
    console.log("\n[2] Authentication - Signup");
    const testEmail = `user_${Date.now()}@example.com`;
    const signupRes = await apiRequest("POST", "/api/auth/signup", {
      name: "Test Visitor",
      email: testEmail,
      password: "Password@123",
    });
    assert(signupRes.status === 201, "POST /api/auth/signup returns 201 Created");
    assert(!!signupRes.body.token, "Signup response contains signed JWT token");
    assert(signupRes.body.user.role === "USER", "New signup receives default 'USER' role");
    assert(!signupRes.body.user.password_hash, "Signup response does not leak password_hash");

    // Duplicate email check
    const dupRes = await apiRequest("POST", "/api/auth/signup", {
      name: "Duplicate User",
      email: testEmail,
      password: "Password@123",
    });
    assert(dupRes.status === 400, "POST /api/auth/signup rejects duplicate email with 400");

    // Missing fields check
    const missingRes = await apiRequest("POST", "/api/auth/signup", {
      name: "Incomplete",
    });
    assert(missingRes.status === 400, "POST /api/auth/signup rejects missing fields with 400");

    // 3. Auth: Normal User Signin
    console.log("\n[3] Authentication - Signin (Normal User)");
    const signinRes = await apiRequest("POST", "/api/auth/signin", {
      email: testEmail,
      password: "Password@123",
    });
    assert(signinRes.status === 200, "POST /api/auth/signin returns 200 OK");
    assert(!!signinRes.body.token, "Signin response contains valid JWT token");
    const userToken = signinRes.body.token;

    // Invalid password
    const badPass = await apiRequest("POST", "/api/auth/signin", {
      email: testEmail,
      password: "WrongPassword!",
    });
    assert(badPass.status === 401, "POST /api/auth/signin rejects wrong password with 401");

    // 4. Auth: Admin Signin
    console.log("\n[4] Authentication - Signin (Administrator)");
    const adminSignin = await apiRequest("POST", "/api/auth/signin", {
      email: "aarav@heritageverse.in",
      password: "Admin@1234",
    });
    assert(adminSignin.status === 200, "Admin account aarav@heritageverse.in can authenticate");
    assert(adminSignin.body.user.role === "ADMIN", "Admin user has role 'ADMIN'");
    assert(!!adminSignin.body.token, "Admin receives signed JWT token");
    const adminToken = adminSignin.body.token;

    // 5. Security & Authorization (RBAC)
    console.log("\n[5] Server-Side Authorization (RBAC Enforcement)");
    const unauthReq = await apiRequest("GET", "/api/admin/stats");
    assert(unauthReq.status === 401, "Unauthenticated request to /api/admin/* rejected with 401");

    const invalidTokenReq = await apiRequest("GET", "/api/admin/stats", null, "invalid.jwt.token");
    assert(invalidTokenReq.status === 401, "Invalid JWT rejected with 401");

    const forbiddenReq = await apiRequest("GET", "/api/admin/stats", null, userToken);
    assert(forbiddenReq.status === 403, "Normal user (role USER) rejected from Admin API with 403");

    const allowedReq = await apiRequest("GET", "/api/admin/stats", null, adminToken);
    assert(allowedReq.status === 200, "Admin user (role ADMIN) allowed on Admin API with 200");

    // 6. Dashboard Stats & Activity
    console.log("\n[6] Admin Dashboard APIs");
    assert(
      typeof allowedReq.body.data.heritageSitesCount === "number",
      "GET /api/admin/stats returns valid metrics structure"
    );

    const activityRes = await apiRequest("GET", "/api/admin/activity", null, adminToken);
    assert(activityRes.status === 200, "GET /api/admin/activity returns 200");
    assert(Array.isArray(activityRes.body.data), "GET /api/admin/activity returns array");

    // 7. Heritage Sites CRUD
    console.log("\n[7] Heritage Sites CRUD");
    const sitesRes = await apiRequest("GET", "/api/admin/sites", null, adminToken);
    assert(sitesRes.status === 200, "GET /api/admin/sites returns 200");
    assert(Array.isArray(sitesRes.body.data), "GET /api/admin/sites returns array");

    const createSiteRes = await apiRequest(
      "POST",
      "/api/admin/sites",
      {
        name: "Elephanta Caves",
        location: "Gharapuri, Maharashtra",
        state: "Maharashtra",
        category: "Caves",
        era: "5th - 6th Century CE",
        status: "PUBLISHED",
        description: "A collection of rock art linked to the cult of Shiva.",
      },
      adminToken
    );
    assert(createSiteRes.status === 201, "POST /api/admin/sites returns 201 Created");
    const newSiteId = createSiteRes.body.data.id;

    const updateSiteRes = await apiRequest(
      "PUT",
      `/api/admin/sites/${newSiteId}`,
      {
        era: "6th - 7th Century CE",
        status: "PUBLISHED",
      },
      adminToken
    );
    assert(updateSiteRes.status === 200, "PUT /api/admin/sites/:id returns 200 OK");
    assert(updateSiteRes.body.data.era === "6th - 7th Century CE", "Site era updated correctly");

    const deleteSiteRes = await apiRequest("DELETE", `/api/admin/sites/${newSiteId}`, null, adminToken);
    assert(deleteSiteRes.status === 200, "DELETE /api/admin/sites/:id returns 200 OK");

    const getDeletedSite = await apiRequest("PUT", `/api/admin/sites/${newSiteId}`, { name: "Ghost" }, adminToken);
    assert(getDeletedSite.status === 404, "Accessing deleted site returns 404 Not Found");

    // 8. Timeline Events CRUD
    console.log("\n[8] Timeline Events CRUD");
    const timelineRes = await apiRequest("GET", "/api/admin/timeline", null, adminToken);
    assert(timelineRes.status === 200, "GET /api/admin/timeline returns 200");

    const createTimelineRes = await apiRequest(
      "POST",
      "/api/admin/timeline",
      {
        year: "1987",
        event: "Elephanta Caves Inscribed on UNESCO List",
        description: "Recognized as a masterpiece of human creative genius.",
        site: "Elephanta Caves",
        status: "PUBLISHED",
      },
      adminToken
    );
    assert(createTimelineRes.status === 201, "POST /api/admin/timeline returns 201 Created");
    const newTimelineId = createTimelineRes.body.data.id;

    const updateTimelineRes = await apiRequest(
      "PUT",
      `/api/admin/timeline/${newTimelineId}`,
      {
        event: "Elephanta Caves officially inscribed",
      },
      adminToken
    );
    assert(updateTimelineRes.status === 200, "PUT /api/admin/timeline/:id returns 200 OK");

    const deleteTimelineRes = await apiRequest(
      "DELETE",
      `/api/admin/timeline/${newTimelineId}`,
      null,
      adminToken
    );
    assert(deleteTimelineRes.status === 200, "DELETE /api/admin/timeline/:id returns 200 OK");

    // 9. Stories CRUD
    console.log("\n[9] Stories CRUD");
    const storiesRes = await apiRequest("GET", "/api/admin/stories", null, adminToken);
    assert(storiesRes.status === 200, "GET /api/admin/stories returns 200");

    const createStoryRes = await apiRequest(
      "POST",
      "/api/admin/stories",
      {
        title: "The Colossal Trimurti of Elephanta",
        category: "Sculpture & Art",
        author: "Meera Nair",
        status: "PUBLISHED",
        content: "Representing Sadashiva with three faces of Shiva.",
      },
      adminToken
    );
    assert(createStoryRes.status === 201, "POST /api/admin/stories returns 201 Created");
    const newStoryId = createStoryRes.body.data.id;

    const updateStoryRes = await apiRequest(
      "PUT",
      `/api/admin/stories/${newStoryId}`,
      {
        status: "ARCHIVED",
      },
      adminToken
    );
    assert(updateStoryRes.status === 200, "PUT /api/admin/stories/:id returns 200 OK");

    const deleteStoryRes = await apiRequest("DELETE", `/api/admin/stories/${newStoryId}`, null, adminToken);
    assert(deleteStoryRes.status === 200, "DELETE /api/admin/stories/:id returns 200 OK");

    // 10. User Management & RBAC Updates
    console.log("\n[10] User Management APIs");
    const usersRes = await apiRequest("GET", "/api/admin/users", null, adminToken);
    assert(usersRes.status === 200, "GET /api/admin/users returns 200");
    const hasPasswordHash = usersRes.body.data.some((u) => u.password_hash !== undefined);
    assert(!hasPasswordHash, "GET /api/admin/users NEVER exposes password_hash");

    // Find the created test user ID
    const targetUser = usersRes.body.data.find((u) => u.email === testEmail);
    assert(!!targetUser, "Newly registered test user is listed in /api/admin/users");

    if (targetUser) {
      const statusUpdateRes = await apiRequest(
        "PATCH",
        `/api/admin/users/${targetUser.id}/status`,
        { status: "SUSPENDED" },
        adminToken
      );
      assert(statusUpdateRes.status === 200, "PATCH /api/admin/users/:id/status updates status to SUSPENDED");

      // Verify suspended user cannot sign in
      const suspendedSignin = await apiRequest("POST", "/api/auth/signin", {
        email: testEmail,
        password: "Password@123",
      });
      assert(suspendedSignin.status === 403, "Suspended user login rejected with 403");

      const roleUpdateRes = await apiRequest(
        "PATCH",
        `/api/admin/users/${targetUser.id}/role`,
        { role: "ADMIN" },
        adminToken
      );
      assert(roleUpdateRes.status === 200, "PATCH /api/admin/users/:id/role updates role to ADMIN");
    }

    // 11. Media Library CRUD
    console.log("\n[11] Media Library APIs");
    const mediaRes = await apiRequest("GET", "/api/admin/media", null, adminToken);
    assert(mediaRes.status === 200, "GET /api/admin/media returns 200");

    const createMediaRes = await apiRequest(
      "POST",
      "/api/admin/media",
      {
        siteId: "1",
        imageUrl: "https://images.unsplash.com/photo-1590050752117?auto=format&fit=crop&w=1200",
        caption: "Main entrance of Panhala Fort",
        status: "PUBLISHED",
      },
      adminToken
    );
    assert(createMediaRes.status === 201, "POST /api/admin/media returns 201 Created");
    const newMediaId = createMediaRes.body.data.id;

    const deleteMediaRes = await apiRequest("DELETE", `/api/admin/media/${newMediaId}`, null, adminToken);
    assert(deleteMediaRes.status === 200, "DELETE /api/admin/media/:id returns 200 OK");

    console.log("\n==================================================");
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================\n");

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test execution error:", err);
    process.exit(1);
  }
}

runTests();
