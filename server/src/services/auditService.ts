import { execute } from "../database/connection";
import type { AuditAction } from "../config/constants";

export async function logAudit(
  userId: number | null,
  action: AuditAction
): Promise<void> {
  try {
    await execute(
      "INSERT INTO audit_logs (user_id, action) VALUES (?, ?)",
      [userId, action]
    );
  } catch (error) {
    // Audit logging must never break the request flow
    console.error("Failed to write audit log:", error);
  }
}
