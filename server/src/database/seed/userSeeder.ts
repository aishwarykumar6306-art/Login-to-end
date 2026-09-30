import { getPool } from "../connection";
import bcrypt from "bcryptjs";
import { ROLES, STATUSES } from "../../config/constants";

export async function seedUsers() {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    // Check if users already exist
    const [existingUsers] = await connection.query(
      "SELECT COUNT(*) as count FROM users WHERE email LIKE '%@example.com'"
    );
    const rows = existingUsers as any[];
    if (rows && rows[0] && rows[0].count > 0) {
      console.log("✅ Users already seeded");
      return;
    }

    // Hash passwords
    const saltRounds = 12;
    const adminPassword = await bcrypt.hash("admin123", saltRounds);
    const moderatorPassword = await bcrypt.hash("moderator123", saltRounds);
    const employeePassword = await bcrypt.hash("employee123", saltRounds);

    // Seed users
    const users = [
      {
        name: "System Administrator",
        email: "admin@example.com",
        password_hash: adminPassword,
        role: ROLES.ADMIN,
        status: STATUSES.ACTIVE,
        last_login: new Date("2024-01-01T00:00:00Z"),
      },
      {
        name: "Content Moderator",
        email: "moderator@example.com",
        password_hash: moderatorPassword,
        role: ROLES.MODERATOR,
        status: STATUSES.ACTIVE,
        last_login: new Date("2024-01-02T00:00:00Z"),
      },
      {
        name: "Regular Employee",
        email: "employee@example.com",
        password_hash: employeePassword,
        role: ROLES.EMPLOYEE,
        status: STATUSES.ACTIVE,
        last_login: new Date("2024-01-03T00:00:00Z"),
      },
      {
        name: "Suspended User",
        email: "suspended@example.com",
        password_hash: await bcrypt.hash("user123", saltRounds),
        role: ROLES.EMPLOYEE,
        status: STATUSES.SUSPENDED,
      },
      {
        name: "Disabled User",
        email: "disabled@example.com",
        password_hash: await bcrypt.hash("user123", saltRounds),
        role: ROLES.EMPLOYEE,
        status: STATUSES.DISABLED,
      },
    ];

    // Insert users
    for (const user of users) {
      await connection.query(
        `INSERT INTO users (name, email, password_hash, role, status, last_login)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          user.name,
          user.email,
          user.password_hash,
          user.role,
          user.status,
          user.last_login || null,
        ]
      );
    }

    console.log(`✅ Seeded ${users.length} users`);
    console.log("\n📋 Development credentials:");
    console.log("Admin:    admin@example.com / admin123");
    console.log("Moderator: moderator@example.com / moderator123");
    console.log("Employee:  employee@example.com / employee123");
    console.log("Suspended: suspended@example.com / user123");
    console.log("Disabled:  disabled@example.com / user123");

  } finally {
    connection.release();
  }
}