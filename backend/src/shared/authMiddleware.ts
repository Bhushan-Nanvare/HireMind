import { Request, Response, NextFunction } from "express";
import { verifyToken, type TokenPayload } from "./jwt";
import { prisma } from "./prisma";

export interface AuthRequest extends Request {
  user?: TokenPayload & { emailVerified: boolean };
}

/**
 * Verifies the JWT, then checks the account still accepts it: the user must exist, and tokens issued before
 * the last password reset are rejected.
 */
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) {
    res.status(401).json({ success: false, error: "No token provided" });
    return;
  }

  const verified = verifyToken(token);
  if (!verified) {
    res.status(401).json({ success: false, error: "Invalid or expired token" });
    return;
  }

  const account = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { role: true, emailVerifiedAt: true, passwordChangedAt: true },
  });
  // JWT issue times have 1-second precision, so compare in whole seconds
  const changedAt = account?.passwordChangedAt;
  const revoked = changedAt ? verified.issuedAt < Math.floor(changedAt.getTime() / 1000) : false;
  if (!account || account.role !== verified.role || revoked) {
    res.status(401).json({ success: false, error: "Your session has expired. Please log in again." });
    return;
  }

  req.user = { userId: verified.userId, role: verified.role, emailVerified: account.emailVerifiedAt !== null };
  next();
}

export function requireRole(role: "CANDIDATE" | "RECRUITER") {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ success: false, error: "Forbidden" });
      return;
    }
    next();
  };
}

/** For actions that rely on a reachable email address: applying to jobs and posting them. Runs after authMiddleware. */
export function requireVerifiedEmail(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.emailVerified) {
    res.status(403).json({
      success: false,
      error: "Please verify your email address first. Check your inbox, or resend the link from your dashboard.",
    });
    return;
  }
  next();
}
