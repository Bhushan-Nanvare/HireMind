import { pipeline } from "stream/promises";
import type { Response } from "express";
import { deleteStored, openStored } from "./storage";

function contentDisposition(type: "inline" | "attachment", fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Streams a stored upload (resume or recording) back to the client. */
export async function sendStoredFile(
  res: Response,
  ref: string,
  options: { contentType: string; fileName: string; disposition?: "inline" | "attachment" }
): Promise<void> {
  const file = await openStored(ref);

  res.setHeader("Content-Type", options.contentType);
  if (file.size !== undefined) res.setHeader("Content-Length", file.size);
  res.setHeader("Content-Disposition", contentDisposition(options.disposition ?? "inline", options.fileName));
  res.setHeader("Cache-Control", "private, no-store");
  await pipeline(file.stream, res);
}

/** Deletes a stored upload if it exists. */
export const removeStoredFile = deleteStored;
