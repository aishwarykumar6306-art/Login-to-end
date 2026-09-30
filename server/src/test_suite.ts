import http from "http";
import app from "./index";
import { getPool, closePool } from "./database/connection";

const PORT = 3099; // Isolated test port

interface TestResponse {
  status: number;
  body: any;
  cookies: string[];
}

function request(
  method: string,
  path: string,
  data?: any,
  cookies?: string[]
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (postData) {
      headers["Content-Length"] = Buffer.byteLength(postData).toString();
    }

    if (cookies && cookies.length > 0) {
      headers["Cookie"] = cookies.join("; ");
    }

    const req = http.request(
      {
        hostname: "localhost",
        port: PORT,
        path,
        method,
        headers,
      },
      (res) => {
        let rawData = "";
        res.on("data", (chunk) => (rawData += chunk));
        res.on("end", () => {
          let body = rawData;
          try {
            body = JSON.parse(rawData);
          } catch {
            // keep raw string
          }
          resolve({
            status: res.statusCode || 500,
            body,
            cookies: res.headers["set-cookie"] || [],
          });
        });
      }
    );

    req.on("error", reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function extractCookie(cookies: string[], name: string): string | null {
  for (const c of cookies) {
    const parts = c.split(";")[0];
    if (parts.startsWith(`${name}=`)) {
      return parts;
    }
  }
  return null;
}

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failedTests++;
  }
}

async function runTests() {
  console.log("\n🧪 STARTING COMPREHENSIVE END-TO-END TEST SUITE\n");

  const server = app.listen(PORT);
  await new Promise((res) => setTimeout(res, 800));

  try {
    // 1. Health check
    console.log("--- 1. Health Check ---");
    const health = await request("GET", "/api/health");
    assert(health.status === 200 && health.body.database === "connected", "Database health check 200 OK");

    // 2. Authentication: Login with Invalid Credentials
    console.log("\n--- 2. Authentication Validations ---");
    const badLogin = await request("POST", "/api/auth/login", {
      email: "admin@example.com",
      password: "wrongpassword",
    });
    assert(badLogin.status === 401 && badLogin.body.error === "Invalid email or password.", "Bad password returns generic 401");

    const nonExistent = await request("POST", "/api/auth/login", {
      email: "nobody@example.com",
      password: "password123",
    });
    assert(nonExistent.status === 401 && nonExistent.body.error === "Invalid email or password.", "Non-existent user returns generic 401");

    // 3. Status checks: Suspended and Disabled accounts
    console.log("\n--- 3. Account Status Enforcement ---");
    const suspended = await request("POST", "/api/auth/login", {
      email: "suspended@example.com",
      password: "user123",
    });
    assert(suspended.status === 401 && suspended.body.error.includes("suspended"), "Suspended account is blocked with message");

    const disabled = await request("POST", "/api/auth/login", {
      email: "disabled@example.com",
      password: "user123",
    });
    assert(disabled.status === 401 && disabled.body.error.includes("disabled"), "Disabled account is blocked with message");

    // 4. Role-based Login: Admin, Moderator, Employee
    console.log("\n--- 4. Role Logins & Redirects ---");
    const adminLogin = await request("POST", "/api/auth/login", {
      email: "admin@example.com",
      password: "admin123",
      rememberMe: true,
    });
    assert(adminLogin.status === 200, "Admin login status 200");
    assert(adminLogin.body.user.role === "ADMIN", "Admin role matches");
    assert(adminLogin.body.redirectUrl === "/admin/dashboard", "Admin redirectUrl is /admin/dashboard");
    const adminCookie = extractCookie(adminLogin.cookies, "auth_session");
    assert(adminCookie !== null, "Admin receives auth_session HTTP-only cookie");

    const modLogin = await request("POST", "/api/auth/login", {
      email: "moderator@example.com",
      password: "moderator123",
    });
    assert(modLogin.status === 200 && modLogin.body.redirectUrl === "/moderator/dashboard", "Moderator redirectUrl is /moderator/dashboard");
    const modCookie = extractCookie(modLogin.cookies, "auth_session");

    const empLogin = await request("POST", "/api/auth/login", {
      email: "employee@example.com",
      password: "employee123",
    });
    assert(empLogin.status === 200 && empLogin.body.redirectUrl === "/employee/dashboard", "Employee redirectUrl is /employee/dashboard");
    const empCookie = extractCookie(empLogin.cookies, "auth_session");

    // 5. GET /api/auth/me
    console.log("\n--- 5. Session Verification (/api/auth/me) ---");
    const meUnauth = await request("GET", "/api/auth/me");
    assert(meUnauth.status === 401, "Unauthenticated /me returns 401");

    const meAdmin = await request("GET", "/api/auth/me", undefined, [adminCookie!]);
    assert(meAdmin.status === 200 && meAdmin.body.user.email === "admin@example.com", "Admin session verified on /me");

    // 6. RBAC Middleware Security
    console.log("\n--- 6. RBAC Authorization Enforcement ---");
    // Admin access
    const adminDashByAdmin = await request("GET", "/api/admin/dashboard", undefined, [adminCookie!]);
    assert(adminDashByAdmin.status === 200 && adminDashByAdmin.body.stats.totalUsers >= 5, "Admin can access admin dashboard");

    // Moderator trying to access admin dashboard -> MUST FAIL with 403
    const adminDashByMod = await request("GET", "/api/admin/dashboard", undefined, [modCookie!]);
    assert(adminDashByMod.status === 403, "Moderator accessing /admin/dashboard is blocked (403 Forbidden)");

    // Employee trying to access admin dashboard -> MUST FAIL with 403
    const adminDashByEmp = await request("GET", "/api/admin/dashboard", undefined, [empCookie!]);
    assert(adminDashByEmp.status === 403, "Employee accessing /admin/dashboard is blocked (403 Forbidden)");

    // Employee trying to access moderator dashboard -> MUST FAIL with 403
    const modDashByEmp = await request("GET", "/api/moderator/dashboard", undefined, [empCookie!]);
    assert(modDashByEmp.status === 403, "Employee accessing /moderator/dashboard is blocked (403 Forbidden)");

    // Moderator accessing moderator dashboard -> MUST SUCCEED with 200
    const modDashByMod = await request("GET", "/api/moderator/dashboard", undefined, [modCookie!]);
    assert(modDashByMod.status === 200, "Moderator can access /moderator/dashboard");

    // Employee accessing employee dashboard -> MUST SUCCEED with 200
    const empDashByEmp = await request("GET", "/api/employee/dashboard", undefined, [empCookie!]);
    assert(empDashByEmp.status === 200, "Employee can access /employee/dashboard");

    // 7. Admin User Management
    console.log("\n--- 7. Admin User Management & Safety Rules ---");
    // List users
    const usersList = await request("GET", "/api/admin/users?limit=10", undefined, [adminCookie!]);
    assert(usersList.status === 200 && Array.isArray(usersList.body.users), "Admin can list users");

    // Create a new test employee
    const newEmpEmail = `test_${Date.now()}@example.com`;
    const createUserRes = await request(
      "POST",
      "/api/admin/users",
      {
        name: "Test Developer",
        email: newEmpEmail,
        password: "password123",
        role: "EMPLOYEE",
        status: "ACTIVE",
      },
      [adminCookie!]
    );
    assert(createUserRes.status === 201 && createUserRes.body.user.email === newEmpEmail, "Admin can create new user");
    const createdUserId = createUserRes.body.user.id;

    // Change role of the new user to MODERATOR
    const changeRoleRes = await request(
      "PATCH",
      `/api/admin/users/${createdUserId}/role`,
      { role: "MODERATOR" },
      [adminCookie!]
    );
    assert(changeRoleRes.status === 200 && changeRoleRes.body.user.role === "MODERATOR", "Admin can promote user to MODERATOR");

    // Safety check: Attempting to demote the LAST ADMIN must be blocked!
    const adminUser = usersList.body.users.find((u: any) => u.email === "admin@example.com");
    if (adminUser) {
      const demoteAdminRes = await request(
        "PATCH",
        `/api/admin/users/${adminUser.id}/role`,
        { role: "EMPLOYEE" },
        [adminCookie!]
      );
      assert(demoteAdminRes.status === 400 && demoteAdminRes.body.error.includes("Administrator must remain"), "Prevent demoting the last active administrator account");
    }

    // Update status to SUSPENDED
    const suspendRes = await request(
      "PATCH",
      `/api/admin/users/${createdUserId}/status`,
      { status: "SUSPENDED" },
      [adminCookie!]
    );
    assert(suspendRes.status === 200 && suspendRes.body.user.status === "SUSPENDED", "Admin can suspend user");

    // Audit logs
    const auditRes = await request("GET", "/api/admin/audit-logs?limit=5", undefined, [adminCookie!]);
    assert(auditRes.status === 200 && auditRes.body.logs.length > 0, "Admin can view audit logs");

    // 8. Logout
    console.log("\n--- 8. Session Termination (/api/auth/logout) ---");
    const logoutRes = await request("POST", "/api/auth/logout", undefined, [adminCookie!]);
    assert(logoutRes.status === 200, "Logout succeeds with 200");

    // After logout, former cookie must be rejected on /me
    const meAfterLogout = await request("GET", "/api/auth/me", undefined, [adminCookie!]);
    assert(meAfterLogout.status === 401, "Session invalidated in DB; old cookie rejected");

    console.log(`\n========================================`);
    console.log(`🏁 TESTS COMPLETED: ${passedTests} passed, ${failedTests} failed`);
    console.log(`========================================\n`);
  } finally {
    server.close();
    await closePool();
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
