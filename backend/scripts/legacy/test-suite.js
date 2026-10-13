/**
 * Optional live API checks against a running local server on port 5000.
 * Unit tests in backend/tests/*.test.js are the default backend `npm test` suite.
 *
 * Admin live checks require TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD in the
 * environment. Do not commit those values. Role promotion is never performed
 * by this script.
 */

const http = require("http");

function apiRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      "Content-Type": "application/json",
    };
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const req = http.request(
      { hostname: "localhost", port: 5000, path, method, headers },
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
      },
    );

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  try {
    const health = await apiRequest("GET", "/health");
    assert(health.status === 200 && health.body.status === "ok", "GET /health responds");

    const testEmail = `user_${Date.now()}@example.com`;
    const signupRes = await apiRequest("POST", "/api/auth/signup", {
      name: "Test Visitor",
      email: testEmail,
      password: "Password@123",
    });
    assert(signupRes.status === 201, "signup returns 201");
    assert(!!signupRes.body.token, "signup returns a token");
    assert(String(signupRes.body.user.role).toLowerCase() === "user", "signup role is user");
    assert(!signupRes.body.user.password_hash, "signup does not leak password_hash");

    const dupRes = await apiRequest("POST", "/api/auth/signup", {
      name: "Duplicate User",
      email: testEmail,
      password: "Password@123",
    });
    assert(dupRes.status === 409, "duplicate email is rejected");

    const signinRes = await apiRequest("POST", "/api/auth/signin", {
      email: testEmail,
      password: "Password@123",
    });
    assert(signinRes.status === 200, "signin succeeds");
    const userToken = signinRes.body.token;

    const badPass = await apiRequest("POST", "/api/auth/signin", {
      email: testEmail,
      password: "WrongPassword!",
    });
    assert(badPass.status === 401, "wrong password is rejected");

    const unauthReq = await apiRequest("GET", "/api/admin/dashboard");
    assert(unauthReq.status === 401, "admin dashboard requires authentication");

    const forbiddenReq = await apiRequest("GET", "/api/admin/dashboard", null, userToken);
    assert(forbiddenReq.status === 403, "ordinary users cannot access admin APIs");

    const adminEmail = process.env.TEST_ADMIN_EMAIL;
    const adminPassword = process.env.TEST_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      console.log("Skipping live admin CRUD: set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for a provisioned administrator.");
    } else {
      const adminSignin = await apiRequest("POST", "/api/auth/signin", {
        email: adminEmail,
        password: adminPassword,
      });
      assert(adminSignin.status === 200, "provisioned admin can sign in");
      assert(String(adminSignin.body.user.role).toLowerCase() === "admin", "admin role is admin");
      const adminToken = adminSignin.body.token;
      const dashboard = await apiRequest("GET", "/api/admin/dashboard", null, adminToken);
      assert(dashboard.status === 200, "admin dashboard succeeds");
    }

    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test execution error:", err.code || err.message || "unknown error");
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
