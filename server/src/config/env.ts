import "dotenv/config";
import { z } from "zod";

// z.coerce.boolean() treats any non-empty string (including "false") as true,
// so parse booleans explicitly.
const booleanish = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const envSchema = z.object({
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default("root"),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().default("enterprise_auth"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_SECRET: z.string().min(1, "REFRESH_TOKEN_SECRET is required"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),
  SESSION_COOKIE_NAME: z.string().default("auth_session"),
  SESSION_COOKIE_SECURE: booleanish,
  SESSION_COOKIE_HTTP_ONLY: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SESSION_COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).default("lax"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("noreply@example.com"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;