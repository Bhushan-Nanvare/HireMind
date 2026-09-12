import { Request, Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../../shared/authMiddleware";
import * as authService from "./auth.service";

const emailField = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
// bcrypt only uses the first 72 bytes of a password
const newPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");
const emailedTokenField = z.string().min(20, "This link is invalid").max(200, "This link is invalid");

const signupSchema = z.object({
  email: emailField,
  password: newPasswordField,
  role: z.enum(["CANDIDATE", "RECRUITER"]),
  name: z.string().trim().min(1, "Name is required").max(100),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required").max(72),
});

const forgotPasswordSchema = z.object({ email: emailField });
const resetPasswordSchema = z.object({ token: emailedTokenField, password: newPasswordField });
const verifyEmailSchema = z.object({ token: emailedTokenField });

export async function signupHandler(req: Request, res: Response) {
  const { email, password, role, name } = signupSchema.parse(req.body);
  const token = await authService.signup(email, password, role, name);
  res.status(201).json({ success: true, data: { token } });
}

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const token = await authService.login(email, password);
  res.json({ success: true, data: { token } });
}

export async function meHandler(req: AuthRequest, res: Response) {
  const profile = await authService.getProfile(req.user!.userId);
  res.json({ success: true, data: profile });
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.requestPasswordReset(email);
  // The same answer whether or not the account exists, so this can't be used to find registered emails
  res.json({
    success: true,
    data: { message: "If an account exists for that email, we've sent a link to reset the password." },
  });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const { token, password } = resetPasswordSchema.parse(req.body);
  const sessionToken = await authService.resetPassword(token, password);
  res.json({ success: true, data: { token: sessionToken } });
}

export async function verifyEmailHandler(req: Request, res: Response) {
  const { token } = verifyEmailSchema.parse(req.body);
  await authService.verifyEmail(token);
  res.json({ success: true, data: { verified: true } });
}

export async function resendVerificationHandler(req: AuthRequest, res: Response) {
  await authService.resendVerification(req.user!.userId);
  res.json({ success: true, data: { message: "We've sent a new verification link to your email." } });
}
