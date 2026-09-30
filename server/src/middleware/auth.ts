import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { validateSession } from "../services/authService";
import type { SafeUser } from "../services/authService";
import { ROLES, type Role } from "../config/constants";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}

export function getSessionToken(req: Request): string | null {
  const cookie = req.cookies?.[env.SESSION_COOKIE_NAME];
  return typeof cookie === "string" && cookie.length > 0 ? cookie : null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = getSessionToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const user = await validateSession(token);
    if (!user) {
      res.status(401).json({ error: "Session invalid or expired." });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("requireAuth error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
}

export function requireRole(
  ...allowedRoles: Role[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "You do not have permission to perform this action." });
      return;
    }

    next();
  };
}

export { ROLES };
