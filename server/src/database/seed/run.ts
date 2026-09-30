import { seedUsers } from "./userSeeder";
import { seedAuditLogs } from "./auditLogSeeder";
import { testConnection, closePool } from "../connection";

async function main() {
  console.log("🔄 Connecting to database...");

  const isConnected = await testConnection();
  if (!isConnected) {
    console.error("❌ Cannot connect to database. Please check your DB configuration.");
    process.exit(1);
  }

  console.log("✅ Database connected\n");

  try {
    await seedUsers();
    console.log("");
    await seedAuditLogs();
    console.log("\n✅ Seeding completed successfully");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();