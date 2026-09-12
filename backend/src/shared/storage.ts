import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { notFound } from "./errors";
import { logger } from "./logger";

// Uploads live either on the local disk (default, fine for one server with a persistent disk) or in any
// S3-compatible bucket (AWS S3, Cloudflare R2, Supabase Storage, MinIO) when STORAGE_DRIVER=s3.
// References stored in the database are "s3:<key>" for buckets, or a plain relative path for local files,
// so rows written before S3 was configured keep working.

const S3_PREFIX = "s3:";

const usesS3 = () => process.env.STORAGE_DRIVER === "s3";

let client: S3Client | undefined;

// Created on first use, so env vars are read after dotenv has run
function s3(): S3Client {
  if (!client) {
    const endpoint = process.env.S3_ENDPOINT;
    client = new S3Client({
      // R2 and some others accept "auto"; AWS needs the bucket's real region
      region: process.env.S3_REGION ?? "auto",
      // Custom endpoints (R2, Supabase, MinIO) address buckets by path
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return client;
}

function bucket(): string {
  const name = process.env.S3_BUCKET;
  if (!name) throw new Error("S3_BUCKET is not set");
  return name;
}

/** Absolute path of a local upload, or null when it resolves outside uploads/ (paths are relative to the backend's cwd). */
function resolveLocal(ref: string): string | null {
  const uploadsRoot = path.resolve("uploads");
  const absolute = path.resolve(ref);
  return absolute.startsWith(uploadsRoot + path.sep) ? absolute : null;
}

/**
 * Takes the file multer just wrote and returns the reference to save in the database. Local storage leaves
 * the file where it is; S3 uploads it and removes the temp file.
 */
export async function storeUpload(
  localPath: string,
  options: { folder: "resumes" | "audio"; contentType: string; fileName?: string }
): Promise<string> {
  if (!usesS3()) return localPath;

  const key = `${options.folder}/${randomUUID()}${path.extname(options.fileName ?? "")}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: await fs.promises.readFile(localPath),
      ContentType: options.contentType,
    })
  );
  await fs.promises.rm(localPath, { force: true });
  return `${S3_PREFIX}${key}`;
}

/** Opens a stored file for streaming, or throws a 404 when it's gone. */
export async function openStored(ref: string): Promise<{ stream: Readable; size?: number }> {
  if (ref.startsWith(S3_PREFIX)) {
    const key = ref.slice(S3_PREFIX.length);
    try {
      const object = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
      if (!object.Body) throw new Error("the object has no body");
      return {
        stream: object.Body as Readable,
        ...(object.ContentLength === undefined ? {} : { size: object.ContentLength }),
      };
    } catch (err) {
      logger.warn("Stored file could not be read", { key, reason: err instanceof Error ? err.message : String(err) });
      throw notFound("This file is no longer available");
    }
  }

  const absolute = resolveLocal(ref);
  const stats = absolute ? await fs.promises.stat(absolute).catch(() => null) : null;
  if (!absolute || !stats?.isFile()) throw notFound("This file is no longer available");
  return { stream: fs.createReadStream(absolute), size: stats.size };
}

/** Deletes a stored file if it's still there. Failures are logged, never thrown. */
export async function deleteStored(ref: string): Promise<void> {
  if (ref.startsWith(S3_PREFIX)) {
    const key = ref.slice(S3_PREFIX.length);
    try {
      await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    } catch (err) {
      logger.warn("Stored file could not be deleted", { key, reason: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const absolute = resolveLocal(ref);
  if (absolute) await fs.promises.rm(absolute, { force: true });
}
