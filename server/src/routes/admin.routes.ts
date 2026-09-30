import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, STATUSES, type Role, type Status } from "../config/constants";
import {
  listUsers,
  createUser,
  updateUserRole,
  updateUserStatus,
  getDashboardStats,
  getRecentAuditLogs,
  getUserById,
} from "../services/userService";

export const adminRouter = Router();

// Protect all admin routes with authentication + ADMIN role check
adminRouter.use(requireAuth, requireRole(ROLES.ADMIN));

adminRouter.get("/dashboard", async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getDashboardStats();
    const recentActivity = await getRecentAuditLogs(10);

    res.status(200).json({
      message: "Admin Dashboard Overview",
      stats,
      recentActivity,
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard metrics." });
  }
});

adminRouter.get("/users", async (req: Request, res: Response): Promise<void> => {
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
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = await listUsers({ search, role, status, limit, offset });
    res.status(200).json(result);
  } catch (error) {
    console.error("Admin list users error:", error);
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

adminRouter.get("/users/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid user ID." });
      return;
    }

    const user = await getUserById(id);
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("Admin get user error:", error);
    res.status(500).json({ error: "Failed to fetch user." });
  }
});

const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters long"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
  role: z.enum([ROLES.ADMIN, ROLES.MODERATOR, ROLES.EMPLOYEE]),
  status: z.enum([STATUSES.ACTIVE, STATUSES.SUSPENDED, STATUSES.DISABLED]).optional(),
});

adminRouter.post("/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = createUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0]?.message });
      return;
    }

    const adminId = req.user!.id;
    const newUser = await createUser(adminId, parseResult.data);

    res.status(201).json({
      message: "User created successfully.",
      user: newUser,
    });
  } catch (error: any) {
    console.error("Admin create user error:", error);
    res.status(400).json({ error: error.message || "Failed to create user." });
  }
});

const updateRoleSchema = z.object({
  role: z.enum([ROLES.ADMIN, ROLES.MODERATOR, ROLES.EMPLOYEE]),
});

adminRouter.patch("/users/:id/role", async (req: Request, res: Response): Promise<void> => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId)) {
      res.status(400).json({ error: "Invalid user ID." });
      return;
    }

    const parseResult = updateRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0]?.message });
      return;
    }

    const adminId = req.user!.id;
    const updatedUser = await updateUserRole(adminId, targetUserId, parseResult.data.role);

    res.status(200).json({
      message: `User role updated to ${updatedUser.role}.`,
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("Admin update role error:", error);
    res.status(400).json({ error: error.message || "Failed to update role." });
  }
});

const updateStatusSchema = z.object({
  status: z.enum([STATUSES.ACTIVE, STATUSES.SUSPENDED, STATUSES.DISABLED]),
});

adminRouter.patch("/users/:id/status", async (req: Request, res: Response): Promise<void> => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId)) {
      res.status(400).json({ error: "Invalid user ID." });
      return;
    }

    const parseResult = updateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0]?.message });
      return;
    }

    const adminId = req.user!.id;
    const updatedUser = await updateUserStatus(adminId, targetUserId, parseResult.data.status);

    res.status(200).json({
      message: `User status updated to ${updatedUser.status}.`,
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("Admin update status error:", error);
    res.status(400).json({ error: error.message || "Failed to update status." });
  }
});

adminRouter.get("/audit-logs", async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const logs = await getRecentAuditLogs(limit);
    res.status(200).json({ logs });
  } catch (error) {
    console.error("Admin audit logs error:", error);
    res.status(500).json({ error: "Failed to fetch audit logs." });
  }
});
