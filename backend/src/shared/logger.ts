import type { RequestHandler } from "express";
import type { AuthRequest } from "./authMiddleware";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

/**
 * One JSON line per event in production (so hosts can parse and filter it), and a short readable line in
 * development. Tests only show errors, to keep their output legible.
 */
function write(level: Level, message: string, fields?: Fields) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;

  if (process.env.NODE_ENV === "production") {
    const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
    if (level === "error") console.error(line);
    else console.log(line);
    return;
  }

  const extras = fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : "";
  const text = `[${level}] ${message}${extras}`;
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};

/** Logs one line per request: method, path, status, duration and the signed-in user. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
    const userId = (req as AuthRequest).user?.userId;
    logger.info("request", {
      method: req.method,
      // Query strings can carry tokens from email links, so log only the path
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      durationMs,
      ...(userId ? { userId } : {}),
    });
  });

  next();
};
