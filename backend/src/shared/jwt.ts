import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  role: "CANDIDATE" | "RECRUITER";
}

export interface VerifiedToken extends TokenPayload {
  /** When the token was issued, in whole seconds since the epoch */
  issuedAt: number;
}

// Read at call time, never in a module-level const: that would be captured before dotenv runs.
// server.ts refuses to start without it, so there is deliberately no fallback secret.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { algorithm: "HS256", expiresIn: "7d" });
}

/** Returns the claims of a valid, unexpired token, or null for anything else. */
export function verifyToken(token: string): VerifiedToken | null {
  const secret = getJwtSecret();
  try {
    // Pin the algorithm so a token can't pick its own (e.g. "none")
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof decoded === "string") return null;
    const { userId, role, iat } = decoded;
    if (typeof userId !== "string" || (role !== "CANDIDATE" && role !== "RECRUITER") || typeof iat !== "number") {
      return null;
    }
    return { userId, role, issuedAt: iat };
  } catch {
    return null;
  }
}
