import type { Request, Response, NextFunction } from "express";

export function notFoundHandler(
  req: Request,
  res: Response
): void {
  res.status(404).json({ error: "Not found." });
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);

  // Never expose internal details (incl. database errors) to clients
  res.status(500).json({ error: "Internal server error." });
}
