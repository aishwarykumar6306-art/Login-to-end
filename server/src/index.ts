import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { testConnection } from "./database/connection";
import { runMigrations } from "./database/migrate";
import { authRouter } from "./routes/auth.routes";
import { adminRouter } from "./routes/admin.routes";
import { moderatorRouter } from "./routes/moderator.routes";
import { employeeRouter } from "./routes/employee.routes";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // allow local testing with index.html
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration for local development and SPAs
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or file://)
      if (!origin) return callback(null, true);
      return callback(null, true);
    },
    credentials: true,
  })
);

// Body and cookie parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static frontend files (e.g. index.html at root)
const projectRoot = path.resolve(__dirname, "../../");
app.use(express.static(projectRoot));

// Health check endpoint
app.get("/api/health", async (_req, res) => {
  const dbOk = await testConnection();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "healthy" : "unhealthy",
    database: dbOk ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/moderator", moderatorRouter);
app.use("/api/employee", employeeRouter);

// Fallback route for index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(projectRoot, "index.html"));
});

// 404 handler
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

// Start server
async function startServer() {
  console.log("🚀 Starting Enterprise Auth Server...");

  try {
    // Run migrations automatically on startup to ensure all tables exist
    await runMigrations();
  } catch (migError) {
    console.warn("⚠️ Migration notice:", migError);
    console.log("Continuing server startup...");
  }

  const isConnected = await testConnection();
  if (isConnected) {
    console.log("✅ Database connected successfully.");
  } else {
    console.warn("⚠️ Warning: Could not connect to MySQL database. Please verify configuration.");
  }

  const server = app.listen(env.PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🔐 Enterprise Auth Server running on port ${env.PORT}`);
    console.log(`📡 URL: http://localhost:${env.PORT}`);
    console.log(`🧪 Health Check: http://localhost:${env.PORT}/api/health`);
    console.log(`======================================================\n`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🛑 Shutting down server...");
    server.close(async () => {
      const { closePool } = await import("./database/connection");
      await closePool();
      console.log("👋 Server shut down cleanly.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("❌ Fatal error during server startup:", err);
    process.exit(1);
  });
}

export default app;
