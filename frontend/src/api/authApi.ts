import api from "./axiosClient";

export type Role = "CANDIDATE" | "RECRUITER";

export interface Profile {
  email: string;
  role: Role;
  name: string;
  emailVerified: boolean;
}

/** Returns a session token */
export async function login(email: string, password: string): Promise<string> {
  const res = await api.post("/auth/login", { email, password });
  return res.data.data.token;
}

/** Returns a session token. The API also emails a link to verify the address. */
export async function signup(details: { email: string; password: string; role: Role; name: string }): Promise<string> {
  const res = await api.post("/auth/signup", details);
  return res.data.data.token;
}

export async function getMe(): Promise<Profile> {
  const res = await api.get("/auth/me");
  return res.data.data;
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email });
}

/** Returns a new session token: resetting the password signs out every existing session. */
export async function resetPassword(token: string, password: string): Promise<string> {
  const res = await api.post("/auth/reset-password", { token, password });
  return res.data.data.token;
}

export async function verifyEmail(token: string): Promise<void> {
  await api.post("/auth/verify-email", { token });
}

export async function resendVerification(): Promise<void> {
  await api.post("/auth/resend-verification");
}
