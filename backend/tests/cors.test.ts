import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const VERCEL = "https://hiremind.vercel.app";
const original = { cors: process.env.CORS_ORIGINS, appUrl: process.env.APP_URL, nodeEnv: process.env.NODE_ENV };

afterEach(() => {
  for (const [key, value] of [
    ["CORS_ORIGINS", original.cors],
    ["APP_URL", original.appUrl],
    ["NODE_ENV", original.nodeEnv],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function allowedHeader(origin: string, config: { cors?: string; appUrl?: string }) {
  if (config.cors === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = config.cors;
  if (config.appUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = config.appUrl;

  const res = await request(createApp()).get("/api/jobs").set("Origin", origin);
  return res.headers["access-control-allow-origin"];
}

describe("CORS", () => {
  it("allows a configured origin", async () => {
    expect(await allowedHeader(VERCEL, { cors: VERCEL })).toBe(VERCEL);
  });

  it("allows it when the configured value has a trailing slash", async () => {
    expect(await allowedHeader(VERCEL, { cors: `${VERCEL}/` })).toBe(VERCEL);
  });

  it("tolerates spaces and several origins", async () => {
    const header = await allowedHeader(VERCEL, { cors: ` https://other.example.com/ , ${VERCEL} ` });
    expect(header).toBe(VERCEL);
  });

  it("allows the frontend's own URL even when CORS_ORIGINS is missing", async () => {
    process.env.NODE_ENV = "production";
    expect(await allowedHeader(VERCEL, { appUrl: `${VERCEL}/` })).toBe(VERCEL);
  });

  it("refuses an origin that isn't configured", async () => {
    expect(await allowedHeader("https://evil.example.com", { cors: VERCEL })).toBeUndefined();
  });

  it("falls back to the local dev servers when nothing is configured", async () => {
    expect(await allowedHeader("http://localhost:5173", {})).toBe("http://localhost:5173");
    expect(await allowedHeader(VERCEL, {})).toBeUndefined();
  });
});
