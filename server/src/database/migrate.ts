import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import { env } from "../config/env";

export async function runMigrations() {
  console.log("🔄 Starting database migrations...");

  // 1. Connect without database name to ensure the database exists
  const rootConn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });

  try {
    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`✅ Database '${env.DB_NAME}' verified / created.`);
  } finally {
    await rootConn.end();
  }

  // 2. Connect to the target database
  const dbConn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
  });

  try {
    const migrationsDir = path.join(__dirname, "migrations");
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      let sql = fs.readFileSync(filePath, "utf-8");

      // Ensure CREATE TABLE IF NOT EXISTS for idempotency
      sql = sql.replace(/CREATE TABLE\s+(?!IF NOT EXISTS)/gi, "CREATE TABLE IF NOT EXISTS ");

      console.log(`  Applying migration: ${file}...`);
      await dbConn.query(sql);
      console.log(`  ✅ Applied: ${file}`);
    }

    console.log("✅ All migrations applied successfully.\n");
  } finally {
    await dbConn.end();
  }
}

// Allow standalone execution
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
