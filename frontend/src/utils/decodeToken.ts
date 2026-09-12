export interface TokenPayload {
  userId: string;
  role: "CANDIDATE" | "RECRUITER";
  /** Expiry as seconds since the epoch */
  exp?: number;
}

/** Reads a JWT's payload without verifying it (the server verifies every request). Null if malformed. */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    // JWTs use base64url; atob expects standard base64
    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof data?.userId !== "string" || (data.role !== "CANDIDATE" && data.role !== "RECRUITER")) return null;
    return { userId: data.userId, role: data.role, exp: typeof data.exp === "number" ? data.exp : undefined };
  } catch {
    return null;
  }
}
