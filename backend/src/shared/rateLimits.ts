import type { Request } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { AuthRequest } from "./authMiddleware";

// In-memory counters: fine for a single backend instance. Multiple instances would need a shared store.

const MINUTE = 60 * 1000;

const tooMany = (error: string) => ({ success: false, error });

// The test suite makes far more requests from one address than a real user, so limits are off there
const skipInTests = () => process.env.NODE_ENV === "test";

/** Every API request, per client IP: a coarse guard against floods and scraping. */
export const apiLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTests,
  message: tooMany("Too many requests. Please slow down and try again shortly."),
});

/** Failed logins per client IP: slows down password guessing. Successful logins don't count. */
export const loginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTests,
  message: tooMany("Too many failed sign-in attempts. Please wait 15 minutes and try again."),
});

/** Sign-ups per client IP: stops mass account creation. */
export const signupLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTests,
  message: tooMany("Too many accounts created from this network. Please try again later."),
});

/** Emails a visitor can trigger (password reset, re-sending verification), per client IP. */
export const emailLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTests,
  message: tooMany("Too many email requests. Please try again later."),
});

/** Uses of emailed links (reset password, verify email), per client IP. */
export const tokenLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTests,
  message: tooMany("Too many attempts. Please wait a few minutes and try again."),
});

/**
 * Endpoints that call Gemini, per signed-in user, so one account can't burn through the AI quota.
 * A full interview is about 8 of these requests. Must run after authMiddleware.
 */
export const aiLimiter = rateLimit({
  windowMs: 10 * MINUTE,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTests,
  keyGenerator: (req: Request) => (req as AuthRequest).user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: tooMany("You're doing that too often. Please wait a few minutes and try again."),
});
