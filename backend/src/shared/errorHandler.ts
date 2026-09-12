import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AiServiceError } from "./embeddings";
import { HttpError } from "./errors";
import { logger } from "./logger";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, error: `No route for ${req.method} ${req.path}` });
};

// Every error ends up here. Only messages known to be safe reach the client; anything unexpected
// (database errors, bugs) is logged and replaced with a generic message.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // A failure mid-way through streaming a file: the response has started, so let Express close the connection
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, message } = toClientError(err);
  if (status >= 500 && !(err instanceof AiServiceError)) {
    logger.error("Unhandled request error", {
      method: req.method,
      path: req.originalUrl.split("?")[0],
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
  res.status(status).json({ success: false, error: message });
};

function toClientError(err: unknown): { status: number; message: string } {
  if (err instanceof HttpError) return { status: err.status, message: err.message };
  if (err instanceof ZodError) return { status: 400, message: formatZodError(err) };
  if (err instanceof AiServiceError) return { status: 503, message: err.message };
  if (err instanceof multer.MulterError) {
    return err.code === "LIMIT_FILE_SIZE"
      ? { status: 413, message: "The file is too large. Resumes can be up to 5 MB and audio recordings up to 10 MB." }
      : { status: 400, message: err.message };
  }
  // body-parser marks its errors with a `type`, e.g. malformed JSON or an oversized body
  const type = (err as { type?: unknown } | null)?.type;
  if (type === "entity.parse.failed") return { status: 400, message: "Request body is not valid JSON" };
  if (type === "entity.too.large") return { status: 413, message: "Request body is too large" };
  return { status: 500, message: "Something went wrong. Please try again." };
}

function formatZodError(err: ZodError): string {
  return err.issues
    .map((issue) => (issue.path.length ? `${issue.path.map(String).join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}
