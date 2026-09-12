import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/shared/email", async () => (await import("./helpers/emailMock")).emailMock());

import { api, auth } from "./helpers/app";
import { prisma, resetDatabase } from "./helpers/db";
import { clearEmails, lastEmailTo, tokenFromEmail } from "./helpers/emailMock";
import { createUser, PASSWORD } from "./helpers/factories";

const JWT_SECRET = process.env.JWT_SECRET!;

beforeEach(async () => {
  await resetDatabase();
  clearEmails();
});

describe("sign-up and login", () => {
  it("creates an account, returns a session and emails a verification link", async () => {
    const email = "nina@test.local";
    const res = await api.post("/api/auth/signup").send({ email, password: PASSWORD, role: "CANDIDATE", name: "Nina New" });

    expect(res.status).toBe(201);
    expect(typeof res.body.data.token).toBe("string");
    expect(lastEmailTo(email)?.subject).toBe("Confirm your email address");
  });

  it("stores the email lowercase and matches it case-insensitively at login", async () => {
    const email = "Mixed.Case@Test.Local";
    await api.post("/api/auth/signup").send({ email, password: PASSWORD, role: "CANDIDATE", name: "Casey" });

    expect(await prisma.user.findUnique({ where: { email: email.toLowerCase() } })).not.toBeNull();
    const login = await api.post("/api/auth/login").send({ email: email.toUpperCase(), password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it("rejects a duplicate email in any case with 409", async () => {
    const user = await createUser("CANDIDATE", "First");
    const again = await api
      .post("/api/auth/signup")
      .send({ email: user.email.toUpperCase(), password: PASSWORD, role: "RECRUITER", name: "Second" });

    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already registered/i);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await api
      .post("/api/auth/signup")
      .send({ email: "short@test.local", password: "abc", role: "CANDIDATE", name: "Shorty" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8 characters/i);
  });

  it("gives the same 401 for a wrong password and an unknown email", async () => {
    const user = await createUser("CANDIDATE", "Someone");
    const wrongPassword = await api.post("/api/auth/login").send({ email: user.email, password: "not-the-password" });
    const unknownEmail = await api.post("/api/auth/login").send({ email: "nobody@test.local", password: "not-the-password" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });

  it("returns the profile from /auth/me", async () => {
    const user = await createUser("RECRUITER", "Acme Corp");
    const res = await api.get("/api/auth/me").set(auth(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: user.email, role: "RECRUITER", name: "Acme Corp", emailVerified: true });
  });
});

describe("email verification", () => {
  it("blocks unverified accounts from applying", async () => {
    const candidate = await createUser("CANDIDATE", "Unverified", { verified: false });
    const res = await api
      .post("/api/applications")
      .set(auth(candidate.token))
      .send({ jobId: "00000000-0000-4000-8000-000000000000", resumeId: "00000000-0000-4000-8000-000000000000" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verify your email/i);
  });

  it("verifies with the emailed link and refuses to reuse it", async () => {
    const candidate = await createUser("CANDIDATE", "To Verify", { verified: false });
    const token = tokenFromEmail(candidate.email, "/verify-email");

    expect((await api.post("/api/auth/verify-email").send({ token })).status).toBe(200);
    expect((await api.get("/api/auth/me").set(auth(candidate.token))).body.data.emailVerified).toBe(true);

    const reuse = await api.post("/api/auth/verify-email").send({ token });
    expect(reuse.status).toBe(400);
  });

  it("invalidates the previous link when a new one is sent", async () => {
    const candidate = await createUser("CANDIDATE", "Resend", { verified: false });
    const firstToken = tokenFromEmail(candidate.email, "/verify-email");

    expect((await api.post("/api/auth/resend-verification").set(auth(candidate.token))).status).toBe(200);
    const secondToken = tokenFromEmail(candidate.email, "/verify-email");
    expect(secondToken).not.toBe(firstToken);

    expect((await api.post("/api/auth/verify-email").send({ token: firstToken })).status).toBe(400);
    expect((await api.post("/api/auth/verify-email").send({ token: secondToken })).status).toBe(200);
  });

  it("returns 409 when the address is already verified", async () => {
    const candidate = await createUser("CANDIDATE", "Already Verified");
    const res = await api.post("/api/auth/resend-verification").set(auth(candidate.token));

    expect(res.status).toBe(409);
  });

  it("rejects a made-up token", async () => {
    const res = await api.post("/api/auth/verify-email").send({ token: "x".repeat(43) });
    expect(res.status).toBe(400);
  });
});

describe("password reset", () => {
  it("changes the password, signs out older sessions and keeps the new one", async () => {
    const user = await createUser("CANDIDATE", "Reset Me");
    // JWT issue times have one-second precision, so make sure this session clearly predates the reset
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await api.post("/api/auth/forgot-password").send({ email: user.email });
    const token = tokenFromEmail(user.email, "/reset-password");
    const reset = await api.post("/api/auth/reset-password").send({ token, password: "new-password-456" });

    expect(reset.status).toBe(200);
    expect((await api.get("/api/auth/me").set(auth(user.token))).status).toBe(401);
    expect((await api.get("/api/auth/me").set(auth(reset.body.data.token))).status).toBe(200);
    expect((await api.post("/api/auth/login").send({ email: user.email, password: PASSWORD })).status).toBe(401);
    expect((await api.post("/api/auth/login").send({ email: user.email, password: "new-password-456" })).status).toBe(200);
  });

  it("answers the same whether or not the account exists", async () => {
    const user = await createUser("CANDIDATE", "Exists");
    const known = await api.post("/api/auth/forgot-password").send({ email: user.email });
    const unknown = await api.post("/api/auth/forgot-password").send({ email: "nobody@test.local" });

    expect(known.status).toBe(200);
    expect(unknown.body.data.message).toBe(known.body.data.message);
    expect(lastEmailTo("nobody@test.local")).toBeUndefined();
  });

  it("won't reuse a reset link", async () => {
    const user = await createUser("CANDIDATE", "Once Only");
    await api.post("/api/auth/forgot-password").send({ email: user.email });
    const token = tokenFromEmail(user.email, "/reset-password");

    expect((await api.post("/api/auth/reset-password").send({ token, password: "first-password-1" })).status).toBe(200);
    expect((await api.post("/api/auth/reset-password").send({ token, password: "second-password-2" })).status).toBe(400);
  });
});

describe("session tokens", () => {
  it("rejects tampered, expired and unsigned tokens", async () => {
    const user = await createUser("CANDIDATE", "Token Tests");
    const claims = { userId: user.userId, role: "CANDIDATE" };
    const base64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

    const cases = [
      jwt.sign(claims, "a-different-secret"),
      jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET),
      jwt.sign(claims, JWT_SECRET, { algorithm: "HS512" }),
      `${base64({ alg: "none", typ: "JWT" })}.${base64(claims)}.`,
    ];

    for (const token of cases) {
      expect((await api.get("/api/auth/me").set(auth(token))).status).toBe(401);
    }
    expect((await api.get("/api/auth/me").set(auth(user.token))).status).toBe(200);
  });

  it("rejects requests without a token", async () => {
    expect((await api.get("/api/auth/me")).status).toBe(401);
  });
});
