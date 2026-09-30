import bcrypt from "bcryptjs";
import { query, queryOne, execute } from "../database/connection";
import { logAudit } from "./auditService";
import { AUDIT_ACTIONS, ROLES, type Role } from "../config/constants";
import { generateSessionToken, hashToken } from "./tokenService";

export type { Role };

const SALT_ROUNDS = 12;

export interface UserRecord {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  created_at: Date;
  updated_at: Date;
  last_login: Date | null;
}

export interface SafeUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: UserRecord["status"];
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

export interface SessionInfo {
  token: string;
  expiresAt: Date;
}

function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.created_at.toISOString(),
    updated_at: user.updated_at.toISOString(),
    last_login: user.last_login ? user.last_login.toISOString() : null,
  };
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return queryOne<UserRecord>(
    "SELECT * FROM users WHERE email = ?",
    [email.toLowerCase()]
  );
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  return queryOne<UserRecord>(
    "SELECT * FROM users WHERE id = ?",
    [id]
  );
}

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginError";
  }
}

export async function login(
  email: string,
  password: string
): Promise<{ user: SafeUser; session: SessionInfo }> {
  const GENERIC_ERROR = "Invalid email or password.";

  const user = await findUserByEmail(email);

  // Constant-ish time: always run a bcrypt compare even if user not found
  const hash =
    user?.password_hash ??
    "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZDZQj1Vp1p2b3c4d5e6f7g8h9i0jK";
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!user || !passwordMatches) {
    await logAudit(user?.id ?? null, AUDIT_ACTIONS.FAILED_LOGIN);
    throw new LoginError(GENERIC_ERROR);
  }

  if (user.status === "SUSPENDED") {
    throw new LoginError(
      "Your account has been suspended. Please contact your administrator."
    );
  }

  if (user.status === "DISABLED") {
    throw new LoginError(
      "Your account has been disabled. Please contact your administrator."
    );
  }

  // Create session
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [user.id, tokenHash, expiresAt]
  );

  await execute("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);
  await logAudit(user.id, AUDIT_ACTIONS.LOGIN);

  return { user: toSafeUser(user), session: { token, expiresAt } };
}

export async function validateSession(
  token: string
): Promise<SafeUser | null> {
  const tokenHash = hashToken(token);

  const session = await queryOne<{
    id: number;
    user_id: number;
    expires_at: Date;
    revoked: number;
  }>(
    "SELECT * FROM refresh_tokens WHERE token_hash = ?",
    [tokenHash]
  );

  if (!session) return null;
  if (session.revoked) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const user = await findUserById(session.user_id);
  if (!user) return null;
  if (user.status !== "ACTIVE") return null;

  return toSafeUser(user);
}

export async function logout(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const session = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM refresh_tokens WHERE token_hash = ?",
    [tokenHash]
  );

  await execute(
    "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?",
    [tokenHash]
  );

  if (session) {
    await logAudit(session.user_id, AUDIT_ACTIONS.LOGOUT);
  }
}

// ---- Password reset (token stored hashed, never returned twice) ----

export async function requestPasswordReset(
  email: string
): Promise<string | null> {
  const user = await findUserByEmail(email);
  if (!user) return null; // silently succeed to avoid email enumeration

  const token = generateSessionToken(); // reuse secure generator
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await execute(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [user.id, tokenHash, expiresAt]
  );

  return token; // In production: send by email instead of returning
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<boolean> {
  const tokenHash = hashToken(token);

  const record = await queryOne<{
    id: number;
    user_id: number;
    expires_at: Date;
    used: number;
  }>(
    "SELECT * FROM password_reset_tokens WHERE token_hash = ?",
    [tokenHash]
  );

  if (!record || record.used) return false;
  if (new Date(record.expires_at).getTime() < Date.now()) return false;

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const conn = await (await import("../database/connection")).getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", [
      passwordHash,
      record.user_id,
    ]);
    await conn.execute(
      "UPDATE password_reset_tokens SET used = TRUE WHERE id = ?",
      [record.id]
    );
    // Revoke all sessions for this user (force re-login everywhere)
    await conn.execute(
      "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?",
      [record.user_id]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  await logAudit(record.user_id, AUDIT_ACTIONS.PASSWORD_RESET);
  return true;
}
