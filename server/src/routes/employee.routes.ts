import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";

export const employeeRouter = Router();

// Any authenticated active user can access employee workspace
employeeRouter.use(requireAuth);

employeeRouter.get("/dashboard", (req: Request, res: Response): void => {
  res.status(200).json({
    message: `Welcome to your workspace, ${req.user!.name}!`,
    user: {
      name: req.user!.name,
      email: req.user!.email,
      role: req.user!.role,
      status: req.user!.status,
      lastLogin: req.user!.last_login,
      memberSince: req.user!.created_at,
    },
    workspace: {
      status: "Operational",
      announcements: [
        "Welcome to the Enterprise System.",
        "Please ensure your credentials and password remain secure.",
      ],
      quickLinks: [
        { title: "Knowledge Base", url: "#" },
        { title: "Team Directory", url: "#" },
        { title: "Helpdesk Support", url: "#" },
      ],
    },
  });
});

employeeRouter.get("/profile", (req: Request, res: Response): void => {
  res.status(200).json({
    user: req.user,
  });
});
