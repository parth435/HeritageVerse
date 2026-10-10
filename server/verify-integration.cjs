/**
 * HeritageVerse Full-Stack Integration Verification Script
 * Validates the complete flow from Admin login -> JWT -> API Client -> Backend DB
 */

const http = require("http");

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    if (token) headers["Authorization"] = `Bearer ${token}`;

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
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log("\n=======================================================");
  console.log("HERITAGEVERSE FULL-STACK ADMIN INTEGRATION VERIFICATION");
  console.log("=======================================================\n");

  let passes = 0;
  let fails = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✓ ${msg}`);
      passes++;
    } else {
      console.error(`  ✗ ${msg}`);
      fails++;
    }
  }

  try {
    // 1. Authenticate Admin
    console.log("[1] Authentication & JWT Verification");
    const adminLogin = await request("POST", "/api/auth/signin", {
      email: "aarav@heritageverse.in",
      password: "Admin@1234",
    });
    assert(adminLogin.status === 200, "Admin login responds with HTTP 200");
    assert(!!adminLogin.data.token, "JWT token returned in login response");
    assert(adminLogin.data.user.role === "ADMIN", "User role is 'ADMIN'");
    const adminToken = adminLogin.data.token;

    // 2. Normal user authentication & RBAC boundary
    console.log("\n[2] RBAC & Server Authorization Boundary");
    const normalLogin = await request("POST", "/api/auth/signin", {
      email: "diya@heritageverse.in",
      password: "Admin@1234",
    });
    assert(normalLogin.status === 200, "Normal user login succeeds");
    assert(normalLogin.data.user.role === "USER", "User role is 'USER'");
    const normalToken = normalLogin.data.token;

    const forbiddenCheck = await request("GET", "/api/admin/stats", null, normalToken);
    assert(forbiddenCheck.status === 403, "Normal user (role: USER) blocked from /api/admin/stats with 403 Forbidden");

    const unauthorizedCheck = await request("GET", "/api/admin/stats", null, null);
    assert(unauthorizedCheck.status === 401, "Unauthenticated request blocked with 401 Unauthorized");

    const badTokenCheck = await request("GET", "/api/admin/stats", null, "invalid-jwt-token");
    assert(badTokenCheck.status === 401, "Invalid JWT rejected with 401 Unauthorized");

    // 3. Admin Dashboard
    console.log("\n[3] Admin Dashboard APIs");
    const stats = await request("GET", "/api/admin/stats", null, adminToken);
    assert(stats.status === 200, "GET /api/admin/stats responds with 200");
    assert(typeof stats.data.data.heritageSitesCount === "number", "stats.heritageSitesCount is a valid number");
    assert(typeof stats.data.data.registeredUsersCount === "number", "stats.registeredUsersCount is a valid number");
    assert(typeof stats.data.data.timelineEventsCount === "number", "stats.timelineEventsCount is a valid number");
    assert(typeof stats.data.data.publishedStoriesCount === "number", "stats.publishedStoriesCount is a valid number");

    const activity = await request("GET", "/api/admin/activity", null, adminToken);
    assert(activity.status === 200, "GET /api/admin/activity responds with 200");
    assert(Array.isArray(activity.data.data), "activity returns an array of entries");

    // 4. Heritage Sites CRUD
    console.log("\n[4] Heritage Sites CRUD");
    const sitesList = await request("GET", "/api/admin/sites", null, adminToken);
    assert(sitesList.status === 200, "GET /api/admin/sites responds with 200");
    assert(Array.isArray(sitesList.data.data), "sitesList returns an array");
    const initialSiteCount = sitesList.data.data.length;

    // Create Site
    const createSite = await request(
      "POST",
      "/api/admin/sites",
      {
        name: "Golconda Fort",
        location: "Hyderabad",
        state: "Telangana",
        category: "Fort",
        era: "16th Century",
        status: "PUBLISHED",
        description: "Historic fort complex once famous for its diamond mines.",
      },
      adminToken
    );
    assert(createSite.status === 201, "POST /api/admin/sites returns 201 Created");
    assert(createSite.data.data.name === "Golconda Fort", "Created site has correct name");
    const newSiteId = createSite.data.data.id;

    // Update Site
    const updateSite = await request(
      "PUT",
      `/api/admin/sites/${newSiteId}`,
      { era: "Qutb Shahi Dynasty (16th Century)" },
      adminToken
    );
    assert(updateSite.status === 200, "PUT /api/admin/sites/:id returns 200 OK");
    assert(updateSite.data.data.era === "Qutb Shahi Dynasty (16th Century)", "Site era successfully updated");

    // Delete Site
    const deleteSite = await request("DELETE", `/api/admin/sites/${newSiteId}`, null, adminToken);
    assert(deleteSite.status === 200, "DELETE /api/admin/sites/:id returns 200 OK");

    const verifySiteDeleted = await request("GET", `/api/admin/sites/${newSiteId}`, null, adminToken);
    const sitesAfterDelete = await request("GET", "/api/admin/sites", null, adminToken);
    assert(sitesAfterDelete.data.data.length === initialSiteCount, "Site count restored after deletion");

    // 5. Timeline Events CRUD
    console.log("\n[5] Timeline Events CRUD");
    const timelineList = await request("GET", "/api/admin/timeline", null, adminToken);
    assert(timelineList.status === 200, "GET /api/admin/timeline returns 200");

    const createTimeline = await request(
      "POST",
      "/api/admin/timeline",
      {
        year: "1591",
        event: "Charminar Founded",
        site: "Hyderabad",
        status: "PUBLISHED",
        description: "Muhammad Quli Qutb Shah commissioned Charminar.",
      },
      adminToken
    );
    assert(createTimeline.status === 201, "POST /api/admin/timeline returns 201 Created");
    const newTimelineId = createTimeline.data.data.id;

    const updateTimeline = await request(
      "PUT",
      `/api/admin/timeline/${newTimelineId}`,
      { description: "Historic monument commemorating the cessation of plague." },
      adminToken
    );
    assert(updateTimeline.status === 200, "PUT /api/admin/timeline/:id returns 200 OK");

    const deleteTimeline = await request("DELETE", `/api/admin/timeline/${newTimelineId}`, null, adminToken);
    assert(deleteTimeline.status === 200, "DELETE /api/admin/timeline/:id returns 200 OK");

    // 6. Stories CRUD
    console.log("\n[6] Editorial Stories CRUD");
    const storiesList = await request("GET", "/api/admin/stories", null, adminToken);
    assert(storiesList.status === 200, "GET /api/admin/stories returns 200");

    const createStory = await request(
      "POST",
      "/api/admin/stories",
      {
        title: "Echoes of Golconda",
        category: "Living Heritage",
        author: "Aarav Mehta",
        status: "PUBLISHED",
        published: "Just now",
        content: "The acoustic marvel of the Fateh Darwaza dome.",
      },
      adminToken
    );
    assert(createStory.status === 201, "POST /api/admin/stories returns 201 Created");
    const newStoryId = createStory.data.data.id;

    const updateStory = await request(
      "PUT",
      `/api/admin/stories/${newStoryId}`,
      { title: "Echoes of the Deccan: Golconda" },
      adminToken
    );
    assert(updateStory.status === 200, "PUT /api/admin/stories/:id returns 200 OK");

    const deleteStory = await request("DELETE", `/api/admin/stories/${newStoryId}`, null, adminToken);
    assert(deleteStory.status === 200, "DELETE /api/admin/stories/:id returns 200 OK");

    // 7. Users Management
    console.log("\n[7] Users Management APIs");
    const usersList = await request("GET", "/api/admin/users", null, adminToken);
    assert(usersList.status === 200, "GET /api/admin/users returns 200");
    assert(usersList.data.data.length > 0, "Users list has entries");
    assert(!usersList.data.data.some((u) => u.password_hash || u.password), "Never exposes password or password_hash");

    // Target a test user (e.g. Diya Sharma)
    const diyaUser = usersList.data.data.find((u) => u.email === "diya@heritageverse.in");
    assert(!!diyaUser, "Found Diya Sharma in users list");

    const updateStatus = await request(
      "PATCH",
      `/api/admin/users/${diyaUser.id}/status`,
      { status: "SUSPENDED" },
      adminToken
    );
    assert(updateStatus.status === 200, "PATCH /api/admin/users/:id/status updates status to SUSPENDED");
    assert(updateStatus.data.data.status === "SUSPENDED", "Response shows status is SUSPENDED");

    // Restore to ACTIVE
    const restoreStatus = await request(
      "PATCH",
      `/api/admin/users/${diyaUser.id}/status`,
      { status: "ACTIVE" },
      adminToken
    );
    assert(restoreStatus.status === 200, "PATCH /api/admin/users/:id/status restores status to ACTIVE");
    assert(restoreStatus.data.data.status === "ACTIVE", "Response shows status is ACTIVE");

    // Update Role
    const updateRole = await request(
      "PATCH",
      `/api/admin/users/${diyaUser.id}/role`,
      { role: "ADMIN" },
      adminToken
    );
    assert(updateRole.status === 200, "PATCH /api/admin/users/:id/role updates role to ADMIN");

    // Restore Role
    const restoreRole = await request(
      "PATCH",
      `/api/admin/users/${diyaUser.id}/role`,
      { role: "USER" },
      adminToken
    );
    assert(restoreRole.status === 200, "PATCH /api/admin/users/:id/role restores role to USER");

    // 8. Media Library CRUD
    console.log("\n[8] Media Library CRUD");
    const mediaList = await request("GET", "/api/admin/media", null, adminToken);
    assert(mediaList.status === 200, "GET /api/admin/media returns 200");
    assert(Array.isArray(mediaList.data.data), "mediaList returns an array");

    const createMedia = await request(
      "POST",
      "/api/admin/media",
      {
        siteId: "1",
        imageUrl: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=1200&q=80",
        caption: "Breathtaking ramparts of Panhala",
        status: "PUBLISHED",
      },
      adminToken
    );
    assert(createMedia.status === 201, "POST /api/admin/media returns 201 Created");
    const newMediaId = createMedia.data.data.id;

    const deleteMedia = await request("DELETE", `/api/admin/media/${newMediaId}`, null, adminToken);
    assert(deleteMedia.status === 200, "DELETE /api/admin/media/:id returns 200 OK");

    // 9. Activity Log Verification
    console.log("\n[9] Real-Time Activity Log Recording");
    const updatedActivity = await request("GET", "/api/admin/activity", null, adminToken);
    assert(updatedActivity.status === 200, "GET /api/admin/activity returns updated activity");
    assert(updatedActivity.data.data.length > 0, "Activity log recorded recent mutations");

    console.log("\n=======================================================");
    console.log(`INTEGRATION TEST SUMMARY: ${passes} PASSED, ${fails} FAILED`);
    console.log("=======================================================\n");

    if (fails > 0) process.exit(1);
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  }
}

run();
