import { z } from "zod";

// Checked once at startup so misconfiguration fails immediately, with a list of what's wrong, instead of
// surfacing as a broken request later. Application code still reads process.env at call time.
const definedValues = (raw: unknown) =>
  // A variable present but empty (RESEND_API_KEY= in a .env file) counts as unset, not as an empty value
  Object.fromEntries(Object.entries(raw as Record<string, string | undefined>).filter(([, value]) => value !== ""));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // The `error` option covers both "missing" and "empty", so the message reads the same either way
    DATABASE_URL: z.string({ error: "DATABASE_URL is not set" }).min(1, "DATABASE_URL is not set"),
    JWT_SECRET: z.string({ error: "JWT_SECRET is not set" }).min(1, "JWT_SECRET is not set"),
    GEMINI_API_KEY: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(5000),
    /** Comma-separated browser origins allowed to call the API */
    CORS_ORIGINS: z.string().optional(),
    /** Number of reverse-proxy hops in front of the server */
    TRUST_PROXY: z.string().optional(),
    /** The frontend's public URL, used in email links */
    APP_URL: z.string().url("APP_URL must be a full URL, e.g. https://hiremind.vercel.app").optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().url("S3_ENDPOINT must be a full URL").optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const mustBeSet = (key: keyof typeof env, message: string) => {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message });
    };

    if (env.NODE_ENV === "production") {
      if (env.JWT_SECRET.length < 32) {
        ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "must be at least 32 characters in production" });
      }
      mustBeSet("GEMINI_API_KEY", "is required in production");
      mustBeSet("CORS_ORIGINS", "is required in production: the frontend's URL");
      mustBeSet("APP_URL", "is required in production: email links point at it");
    }

    if (env.STORAGE_DRIVER === "s3") {
      mustBeSet("S3_BUCKET", "is required when STORAGE_DRIVER is s3");
      mustBeSet("S3_ACCESS_KEY_ID", "is required when STORAGE_DRIVER is s3");
      mustBeSet("S3_SECRET_ACCESS_KEY", "is required when STORAGE_DRIVER is s3");
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Validates the environment, or prints every problem and exits. Call once, after dotenv. */
export function loadEnv(): Env {
  const result = envSchema.safeParse(definedValues(process.env));
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`);
    console.error(`[startup] The environment isn't usable:\n${problems.join("\n")}`);
    process.exit(1);
  }

  for (const warning of gaps(result.data)) console.warn(`[startup] ${warning}`);
  return result.data;
}

/** Things that work but probably aren't what you want. */
function gaps(env: Env): string[] {
  const warnings: string[] = [];
  if (env.NODE_ENV !== "production") {
    if (!env.GEMINI_API_KEY) warnings.push("GEMINI_API_KEY is not set: match scores and interviews will fail.");
    if (env.JWT_SECRET.length < 32) warnings.push("JWT_SECRET is shorter than 32 characters. Use a long random value in production.");
    if (!env.CORS_ORIGINS) warnings.push("CORS_ORIGINS is not set: only the local Vite servers can call the API from a browser.");
  }
  if (!env.RESEND_API_KEY) {
    warnings.push(
      env.NODE_ENV === "production"
        ? "RESEND_API_KEY is not set: verification, password reset and status emails will NOT be sent."
        : "RESEND_API_KEY is not set: emails will be printed here instead of sent."
    );
  }
  if (env.STORAGE_DRIVER === "local" && env.NODE_ENV === "production") {
    warnings.push("STORAGE_DRIVER is local: uploaded resumes and recordings are lost when the host's disk resets.");
  }
  return warnings;
}
