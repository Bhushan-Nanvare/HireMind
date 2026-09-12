import crypto from "crypto";

/** A random single-use token for an email link. Store only `tokenHash`; the raw token goes in the email. */
export function createOneTimeToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
