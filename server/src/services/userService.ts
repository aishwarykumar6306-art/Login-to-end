import bcrypt from "bcryptjs";
import { query, queryOne, execute } from "../database/connection";
import { AUDIT_ACTIONS, ROLES, STATUSES, type Role, type Status } from "../config/constants";
import { logAudit } from "./auditService";
import type { SafeUser, UserRecord } from "./authService";

const SALT_ROUNDS = 12;

function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: new Date(user.created_at).toISOString(),
    updated_at: new Date(user.updated_at).toISOString(),
    last_login: user.last_login ? new Date(user.last_login).toISOString() : null,
  };
}

export interface UserFilterOptions {
  search?: string;
  role?: Role;
  status?: Status;
  limit?: number;
  offset?: number;
}

export async function listUsers(
  options: UserFilterOptions = {}
): Promise<{ users: SafeUser[]; total: number }> {
  const { search, role, status, limit = 50, offset = 0 } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    conditions.push("(name LIKE ? OR email LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (role) {
    conditions.push("role = ?");
    params.push(role);
  }

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countResult = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM users ${whereClause}`,
    params
  );
  const total = countResult?.count ?? 0;

  // Get paginated users
  const rows = await query<UserRecord>(
    `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  return {
    users: rows.map(toSafeUser),
    total,
  };
}

export async function registerUser(
  data: {
    name: string;
    email: string;
    password: string;
  }
): Promise<SafeUser> {
  const existing = await queryOne<UserRecord>("SELECT id FROM users WHERE email = ?", [
    data.email.toLowerCase().trim(),
  ]);

  if (existing) {
    throw new Error("A user with this email address already exists.");
  }

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  const result = await execute(
    `INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)`,
    [data.name.trim(), data.email.toLowerCase().trim(), passwordHash, ROLES.EMPLOYEE, STATUSES.ACTIVE]
  );

  // Record public registration audit
  await logAudit(null, AUDIT_ACTIONS.USER_CREATED);

  const newUser = await queryOne<UserRecord>("SELECT * FROM users WHERE id = ?", [
    result.insertId,
  ]);
  if (!newUser) {
    throw new Error("Failed to retrieve newly created user.");
  }

  return toSafeUser(newUser);
}

export async function getUserById(id: number): Promise<SafeUser | null> {
  const user = await queryOne<UserRecord>("SELECT * FROM users WHERE id = ?", [id]);
  return user ? toSafeUser(user) : null;
}

export async function countActiveAdmins(): Promise<number> {
  const result = await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM users WHERE role = ? AND status = ?",
    [ROLES.ADMIN, STATUSES.ACTIVE]
  );
  return result?.count ?? 0;
}

export async function createUser(
  actorAdminId: number,
  data: {
    name: string;
    email: string;
    password: string;
    role: Role;
    status?: Status;
  }
): Promise<SafeUser> {
  const existing = await queryOne<UserRecord>("SELECT id FROM users WHERE email = ?", [
    data.email.toLowerCase().trim(),
  ]);

  if (existing) {
    throw new Error("A user with this email address already exists.");
  }

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  const userStatus = data.status || STATUSES.ACTIVE;

  const result = await execute(
    `INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)`,
    [data.name.trim(), data.email.toLowerCase().trim(), passwordHash, data.role, userStatus]
  );

  await logAudit(actorAdminId, AUDIT_ACTIONS.USER_CREATED);

  const newUser = await queryOne<UserRecord>("SELECT * FROM users WHERE id = ?", [
    result.insertId,
  ]);
  if (!newUser) {
    throw new Error("Failed to retrieve newly created user.");
  }

  return toSafeUser(newUser);
}

export async function updateUserRole(
  actorAdminId: number,
  targetUserId: number,
  newRole: Role
): Promise<SafeUser> {
  const targetUser = await queryOne<UserRecord>("SELECT * FROM users WHERE id = ?", [
    targetUserId,
  ]);

  if (!targetUser) {
    throw new Error("User not found.");
  }

  if (targetUser.role === newRole) {
    return toSafeUser(targetUser);
  }

  // Prevent demoting the last active administrator
  if (targetUser.role === ROLES.ADMIN && newRole !== ROLES.ADMIN) {
    const adminCount = await countActiveAdmins();
    if (adminCount <= 1) {
      throw new Error("Cannot change role. At least one active Administrator must remain.");
    }
  }

  await execute("UPDATE users SET role = ? WHERE id = ?", [newRole, targetUserId]);
  await logAudit(actorAdminId, AUDIT_ACTIONS.ROLE_CHANGED);

  const updated = await queryOne<UserRecord>("SELECT * FROM users WHERE id = ?", [
    targetUserId,
  ]);
  return toSafeUser(updated!);
}

export async function updateUserStatus(
  actorAdminId: number,
  targetUserId: number,
  newStatus: Status
): Promise<SafeUser> {
  const targetUser = await queryOne<UserRecord>("SELECT * FROM users WHERE id = ?", [
    targetUserId,
  ]);

  if (!targetUser) {
    throw new Error("User not found.");
  }

  if (targetUser.status === newStatus) {
    return toSafeUser(targetUser);
  }

  // Prevent disabling or suspending the last active administrator
  if (
    targetUser.role === ROLES.ADMIN &&
    targetUser.status === STATUSES.ACTIVE &&
    newStatus !== STATUSES.ACTIVE
  ) {
    const adminCount = await countActiveAdmins();
    if (adminCount <= 1) {
      throw new Error(
        `Cannot ${newStatus.toLowerCase()} user. At least one active Administrator must remain.`
      );
    }
  }

  await execute("UPDATE users SET status = ? WHERE id = ?", [newStatus, targetUserId]);

  // If suspended or disabled, invalidate all active sessions immediately
  if (newStatus === STATUSES.SUSPENDED || newStatus === STATUSES.DISABLED) {
    await execute("UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?", [
      targetUserId,
    ]);
  }

  if (newStatus === STATUSES.DISABLED) {
    await logAudit(actorAdminId, AUDIT_ACTIONS.USER_DISABLED);
  } else if (newStatus === STATUSES.SUSPENDED) {
    await logAudit(actorAdminId, AUDIT_ACTIONS.USER_SUSPENDED);
  } else if (newStatus === STATUSES.ACTIVE) {
    await logAudit(actorAdminId, AUDIT_ACTIONS.USER_ENABLED);
  }

  const updated = await queryOne<UserRecord>("SELECT * FROM users WHERE id = ?", [
    targetUserId,
  ]);
  return toSafeUser(updated!);
}

export async function getDashboardStats() {
  const [totalResult, activeResult, suspendedResult, disabledResult] = await Promise.all([
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users"),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE status = 'ACTIVE'"),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE status = 'SUSPENDED'"),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE status = 'DISABLED'"),
  ]);

  const [adminCount, modCount, empCount] = await Promise.all([
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'"),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'MODERATOR'"),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'EMPLOYEE'"),
  ]);

  return {
    totalUsers: totalResult?.count ?? 0,
    activeUsers: activeResult?.count ?? 0,
    suspendedUsers: suspendedResult?.count ?? 0,
    disabledUsers: disabledResult?.count ?? 0,
    byRole: {
      admins: adminCount?.count ?? 0,
      moderators: modCount?.count ?? 0,
      employees: empCount?.count ?? 0,
    },
  };
}

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  created_at: string;
}

export async function getRecentAuditLogs(limit: number = 20): Promise<AuditLogEntry[]> {
  const rows = await query<{
    id: number;
    user_id: number | null;
    user_name: string | null;
    user_email: string | null;
    action: string;
    created_at: Date;
  }>(
    `SELECT a.id, a.user_id, u.name as user_name, u.email as user_email, a.action, a.created_at
     FROM audit_logs a
     LEFT JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    user_name: r.user_name,
    user_email: r.user_email,
    action: r.action,
    created_at: new Date(r.created_at).toISOString(),
  }));
}
