import express from "express";
import cors from "cors";
import helmet from "helmet";
import applicationRoutes from "./modules/applications/applications.routes";
import authRoutes from "./modules/auth/auth.routes";
import interviewRoutes from "./modules/interviews/interviews.routes";
import jobRoutes from "./modules/jobs/jobs.routes";
import resumeRoutes from "./modules/resumes/resumes.routes";
import { errorHandler, notFoundHandler } from "./shared/errorHandler";
import { logger, requestLogger } from "./shared/logger";
import { apiLimiter } from "./shared/rateLimits";

const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:4173"];

/** Browser origins allowed to call the API: CORS_ORIGINS (comma-separated), or the Vite dev servers. */
function allowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (configured?.length) return configured;
  logger.warn("CORS_ORIGINS is not set", { allowed: DEV_ORIGINS });
  return DEV_ORIGINS;
}

// Built in a function (called after dotenv has loaded) so env vars are read at startup, not import time
export function createApp() {
  const app = express();

  // Behind a reverse proxy (Render, Railway, Fly, nginx...) set TRUST_PROXY to the number of proxy hops,
  // so rate limiting sees real client IPs. Leave it unset when clients connect directly.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins() }));
  app.use(express.json({ limit: "100kb" }));

  // Before the rate limiter and the request log, so frequent health checks are neither throttled nor noisy
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api", apiLimiter);
  app.use(requestLogger);

  app.use("/api/auth", authRoutes);
  app.use("/api/jobs", jobRoutes);
  app.use("/api/resumes", resumeRoutes);
  app.use("/api/applications", applicationRoutes);
  app.use("/api/interviews", interviewRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
