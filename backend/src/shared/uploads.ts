import path from "path";
import multer from "multer";
import { badRequest } from "./errors";

const MB = 1024 * 1024;

// Paths are relative to the working directory, so the backend must be started from backend/

/** A single PDF resume up to 5 MB. The file signature is checked again after upload (resumes.service.ts). */
export const resumeUpload = multer({
  dest: "uploads/resumes/",
  limits: { fileSize: 5 * MB, files: 1 },
  fileFilter: (_req, file, cb) => {
    const looksLikePdf = file.mimetype === "application/pdf" || path.extname(file.originalname).toLowerCase() === ".pdf";
    if (looksLikePdf) cb(null, true);
    else cb(badRequest("Only PDF resumes are supported"));
  },
});

const AUDIO_MIME_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav"]);

/** A single audio answer up to 10 MB. */
export const audioUpload = multer({
  dest: "uploads/audio/",
  limits: { fileSize: 10 * MB, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Browsers report e.g. "audio/webm;codecs=opus"
    const baseType = file.mimetype.split(";")[0]?.trim() ?? "";
    if (AUDIO_MIME_TYPES.has(baseType)) cb(null, true);
    else cb(badRequest("Unsupported audio format"));
  },
});
