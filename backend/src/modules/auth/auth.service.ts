import bcrypt from "bcrypt";
import type { $Enums } from "../../../generated/prisma";
import { sendEmailInBackground } from "../../shared/email";
import { passwordResetEmail, verificationEmail } from "../../shared/emailTemplates";
import { badRequest, conflict, notFound, unauthorized } from "../../shared/errors";
import { signToken } from "../../shared/jwt";
import { prisma, isUniqueViolation } from "../../shared/prisma";
import { createOneTimeToken, hashToken } from "../../shared/tokens";

const EMAIL_VERIFICATION: $Enums.AuthTokenType = "EMAIL_VERIFICATION";
const PASSWORD_RESET: $Enums.AuthTokenType = "PASSWORD_RESET";
const HOUR = 60 * 60 * 1000;

// Compared against when an email isn't registered, so a failed login takes the same time either way and
// response timing doesn't reveal which emails have accounts.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("hiremind-timing-equalizer", 10);

function findUserByEmail(email: string) {
  // New emails are stored lowercase, but older accounts may contain capitals
  return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

function displayName(user: { candidate: { fullName: string } | null; recruiter: { companyName: string } | null }) {
  return user.candidate?.fullName ?? user.recruiter?.companyName ?? "there";
}

/** Replaces the user's unused tokens of this type with a new one, and returns the raw token for the email link. */
async function issueEmailToken(userId: string, type: $Enums.AuthTokenType, lifetimeMs: number): Promise<string> {
  const { token, tokenHash } = createOneTimeToken();
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.authToken.create({ data: { userId, type, tokenHash, expiresAt: new Date(Date.now() + lifetimeMs) } }),
  ]);
  return token;
}

/**
 * Marks an emailed token as used and returns its user's id. The conditional update means two requests racing
 * with the same link can't both succeed.
 */
async function consumeEmailToken(rawToken: string, type: $Enums.AuthTokenType): Promise<string> {
  const record = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record || record.type !== type || record.usedAt) {
    throw badRequest("This link is invalid or has already been used.");
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw badRequest("This link has expired. Please request a new one.");
  }
  const claimed = await prisma.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw badRequest("This link is invalid or has already been used.");
  return record.userId;
}

export async function signup(email: string, password: string, role: "CANDIDATE" | "RECRUITER", name: string) {
  if (await findUserByEmail(email)) throw conflict("Email already registered");

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        ...(role === "CANDIDATE"
          ? { candidate: { create: { fullName: name } } }
          : { recruiter: { create: { companyName: name } } }),
      },
    });
    const verificationToken = await issueEmailToken(user.id, EMAIL_VERIFICATION, 24 * HOUR);
    sendEmailInBackground(verificationEmail(user.email, name, verificationToken));
    return signToken({ userId: user.id, role: user.role });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("Email already registered");
    throw err;
  }
}

export async function login(email: string, password: string) {
  const user = await findUserByEmail(email);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) throw unauthorized("Invalid email or password");

  return signToken({ userId: user.id, role: user.role });
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      emailVerifiedAt: true,
      candidate: { select: { fullName: true } },
      recruiter: { select: { companyName: true } },
    },
  });
  if (!user) throw notFound("Account not found");
  return { email: user.email, role: user.role, name: displayName(user), emailVerified: user.emailVerifiedAt !== null };
}

export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);
  if (!user) return;
  const token = await issueEmailToken(user.id, PASSWORD_RESET, HOUR);
  sendEmailInBackground(passwordResetEmail(user.email, token));
}

/** Sets a new password from an emailed link, signs out every existing session and returns a fresh session token. */
export async function resetPassword(rawToken: string, password: string) {
  const userId = await consumeEmailToken(rawToken, PASSWORD_RESET);
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  const user = await prisma.user.update({
    where: { id: userId },
    // authMiddleware rejects every token issued before passwordChangedAt
    data: { passwordHash, passwordChangedAt: now },
    select: { id: true, role: true, emailVerifiedAt: true },
  });
  await prisma.authToken.deleteMany({ where: { userId, type: PASSWORD_RESET, usedAt: null } });
  // Receiving the reset link proves the user controls the address
  if (!user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
  }
  return signToken({ userId: user.id, role: user.role });
}

export async function verifyEmail(rawToken: string) {
  const userId = await consumeEmailToken(rawToken, EMAIL_VERIFICATION);
  await prisma.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailVerifiedAt: true,
      candidate: { select: { fullName: true } },
      recruiter: { select: { companyName: true } },
    },
  });
  if (!user) throw notFound("Account not found");
  if (user.emailVerifiedAt) throw conflict("Your email address is already verified");

  const token = await issueEmailToken(userId, EMAIL_VERIFICATION, 24 * HOUR);
  sendEmailInBackground(verificationEmail(user.email, displayName(user), token));
}
