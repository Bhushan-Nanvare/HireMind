import { Router } from "express";
import { authMiddleware } from "../../shared/authMiddleware";
import { emailLimiter, loginLimiter, signupLimiter, tokenLimiter } from "../../shared/rateLimits";
import {
  signupHandler,
  loginHandler,
  meHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  verifyEmailHandler,
  resendVerificationHandler,
} from "./auth.controller";

const router = Router();
router.post("/signup", signupLimiter, signupHandler);
router.post("/login", loginLimiter, loginHandler);
router.get("/me", authMiddleware, meHandler);
router.post("/forgot-password", emailLimiter, forgotPasswordHandler);
router.post("/reset-password", tokenLimiter, resetPasswordHandler);
// Public: the link may be opened on a device where the user isn't logged in
router.post("/verify-email", tokenLimiter, verifyEmailHandler);
router.post("/resend-verification", authMiddleware, emailLimiter, resendVerificationHandler);

export default router;
