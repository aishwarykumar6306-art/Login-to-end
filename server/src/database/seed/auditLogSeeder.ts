import { getPool } from "../connection";
import { AUDIT_ACTIONS } from "../../config/constants";

export async function seedAuditLogs() {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    // Check if audit logs already exist
    const [existingLogs] = await connection.query(
      "SELECT COUNT(*) as count FROM audit_logs"
    );
    const rows = existingLogs as any[];
    if (rows && rows[0] && rows[0].count > 0) {
      console.log("✅ Audit logs already seeded");
      return;
    }

    const auditLogs = [
      {
        user_id: 1, // admin@example.com
        action: AUDIT_ACTIONS.USER_CREATED,
      },
      {
        user_id: 2, // moderator@example.com
        action: AUDIT_ACTIONS.USER_CREATED,
      },
      {
        user_id: 3, // employee@example.com
        action: AUDIT_ACTIONS.USER_CREATED,
      },
      {
        user_id: 1,
        action: AUDIT_ACTIONS.ROLE_CHANGED,
      },
      {
        user_id: 1,
        action: AUDIT_ACTIONS.LOGIN,
      },
      {
        user_id: 2,
        action: AUDIT_ACTIONS.LOGIN,
      },
      {
        user_id: 3,
        action: AUDIT_ACTIONS.LOGIN,
      },
    ];

    // Insert audit logs
    for (const log of auditLogs) {
      await connection.query(
        `INSERT INTO audit_logs (user_id, action) VALUES (?, ?)`,
        [log.user_id, log.action]
      );
    }

    console.log(`✅ Seeded ${auditLogs.length} audit logs`);

  } finally {
    connection.release();
  }
}