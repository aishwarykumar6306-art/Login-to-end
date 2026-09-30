import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, type Role, type Status, STATUSES } from "../config/constants";
import { listUsers, getDashboardStats, getRecentAuditLogs } from "../services/userService";

export const moderatorRouter = Router();

// Protect moderator routes with ADMIN and MODERATOR roles
moderatorRouter.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.MODERATOR));

moderatorRouter.get("/dashboard", async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getDashboardStats();
    const recentActivity = await getRecentAuditLogs(10);

    res.status(200).json({
      message: `Welcome to the Moderator Workspace, ${req.user!.name}`,
      currentRole: req.user!.role,
      user: req.user,
      moderationStats: {
        totalUsers: stats.totalUsers,
        activeUsers: stats.activeUsers,
        suspendedUsers: stats.suspendedUsers,
      },
      recentActivity,
    });
  } catch (error) {
    console.error("Moderator dashboard error:", error);
    res.status(500).json({ error: "Failed to load moderator dashboard." });
  }
});

// Read-only user listing for moderators
moderatorRouter.get("/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const role =
      typeof req.query.role === "string" && Object.values(ROLES).includes(req.query.role as Role)
        ? (req.query.role as Role)
        : undefined;
    const status =
      typeof req.query.status === "string" &&
      Object.values(STATUSES).includes(req.query.status as Status)
        ? (req.query.status as Status)
        : undefined;

    const result = await listUsers({ search, role, status, limit: 30 });
    res.status(200).json(result);
  } catch (error) {
    console.error("Moderator list users error:", error);
    res.status(500).json({ error: "Failed to fetch users." });
  }
});
