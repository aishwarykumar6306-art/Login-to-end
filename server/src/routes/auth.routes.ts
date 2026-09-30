import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import {
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  LoginError,
} from "../services/authService";
import { registerUser } from "../services/userService";
import { requireAuth, getSessionToken } from "../middleware/auth";
import { ROLES, type Role } from "../config/constants";

export const authRouter = Router();

export function getRoleDashboardUrl(role: Role): string {
  switch (role) {
    case ROLES.ADMIN:
      return "/admin/dashboard";
    case ROLES.MODERATOR:
      return "/moderator/dashboard";
    case ROLES.EMPLOYEE:
    default:
      return "/employee/dashboard";
  }
}

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

authRouter.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: parseResult.error.errors[0]?.message || "Invalid input data.",
      });
      return;
    }

    const { name, email, password } = parseResult.data;

    // Register the user
    const user = await registerUser({ name, email, password });

    // Auto-login after registration (reusing session logic)
    const { session } = await login(email, password);

    res.cookie(env.SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: env.SESSION_COOKIE_SECURE,
      sameSite: env.SESSION_COOKIE_SAMESITE as "lax" | "strict" | "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    const redirectUrl = getRoleDashboardUrl(user.role);

    res.status(201).json({
      message: "Registration successful.",
      user,
      redirectUrl,
    });
  } catch (error) {
    console.error("Registration route error:", error);
    res.status(500).json({ error: (error as Error).message || "Internal server error." });
  }
});

authRouter.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: parseResult.error.errors[0]?.message || "Invalid input data.",
      });
      return;
    }

    const { email, password, rememberMe } = parseResult.data;

    const { user, session } = await login(email, password);

    // Cookie configuration
    const maxAge = rememberMe
      ? 7 * 24 * 60 * 60 * 1000 // 7 days
      : undefined; // Session cookie (expires when browser closes)

    res.cookie(env.SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: env.SESSION_COOKIE_SECURE,
      sameSite: env.SESSION_COOKIE_SAMESITE as "lax" | "strict" | "none",
      maxAge,
      path: "/",
    });

    const redirectUrl = getRoleDashboardUrl(user.role);

    res.status(200).json({
      message: "Login successful.",
      user,
      redirectUrl,
    });
  } catch (error) {
    if (error instanceof LoginError) {
      res.status(401).json({ error: error.message });
      return;
    }
    console.error("Login route error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

authRouter.post("/logout", async (req: Request, res: Response): Promise<void> => {
  try {
    const token = getSessionToken(req);
    if (token) {
      await logout(token);
    }

    res.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: env.SESSION_COOKIE_SECURE,
      sameSite: env.SESSION_COOKIE_SAMESITE as "lax" | "strict" | "none",
      path: "/",
    });

    res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    console.error("Logout route error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

authRouter.get("/me", requireAuth, (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const redirectUrl = getRoleDashboardUrl(req.user.role);
  res.status(200).json({
    user: req.user,
    redirectUrl,
  });
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
});

authRouter.post("/forgot-password", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = forgotPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0]?.message });
      return;
    }

    const resetToken = await requestPasswordReset(parseResult.data.email);

    // Generic response regardless of whether user exists
    const response: { message: string; debugResetToken?: string } = {
      message:
        "If that email exists in our records, password reset instructions have been generated.",
    };

    // For development convenience, return reset token in non-production
    if (env.NODE_ENV === "development" && resetToken) {
      response.debugResetToken = resetToken;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("Forgot password route error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters long"),
});

authRouter.post("/reset-password", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = resetPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0]?.message });
      return;
    }

    const { token, newPassword } = parseResult.data;
    const success = await resetPassword(token, newPassword);

    if (!success) {
      res.status(400).json({
        error: "Password reset link is invalid or has expired.",
      });
      return;
    }

    res.status(200).json({
      message: "Password has been successfully updated. You may now log in.",
    });
  } catch (error) {
    console.error("Reset password route error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});
