import { decodeToken, type TokenPayload } from "./decodeToken";

export type Role = TokenPayload["role"];

/** The payload of a well-formed, unexpired token, or null. The server still verifies it on every request. */
export function readSession(token: string | null): TokenPayload | null {
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  if (payload.exp !== undefined && payload.exp * 1000 <= Date.now()) return null;
  return payload;
}

export function dashboardPathFor(role: Role): string {
  return role === "CANDIDATE" ? "/candidate/dashboard" : "/recruiter/dashboard";
}
