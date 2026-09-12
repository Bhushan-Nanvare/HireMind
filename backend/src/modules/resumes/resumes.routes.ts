import { Router } from "express";
import { authMiddleware, requireRole } from "../../shared/authMiddleware";
import { aiLimiter } from "../../shared/rateLimits";
import { resumeUpload } from "../../shared/uploads";
import { uploadHandler, listHandler, fileHandler, deleteHandler } from "./resumes.controller";

const router = Router();

router.post("/upload", authMiddleware, requireRole("CANDIDATE"), aiLimiter, resumeUpload.single("resume"), uploadHandler);
router.get("/mine", authMiddleware, requireRole("CANDIDATE"), listHandler);
router.get("/:id/file", authMiddleware, requireRole("CANDIDATE"), fileHandler);
router.delete("/:id", authMiddleware, requireRole("CANDIDATE"), deleteHandler);

export default router;
