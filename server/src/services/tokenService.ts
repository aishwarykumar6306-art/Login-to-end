import crypto from "crypto";

/**
 * Session tokens are random opaque strings (no JWT needed for server-side
 * sessions). Only a SHA-256 hash of the token is stored in the database,
 * so a database leak never exposes usable session tokens.
 */

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
