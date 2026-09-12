import { Router } from "express";
import { authMiddleware, requireRole, requireVerifiedEmail } from "../../shared/authMiddleware";
import { aiLimiter } from "../../shared/rateLimits";
import {
  applyHandler,
  listMineHandler,
  listApplicantsHandler,
  detailHandler,
  resumeFileHandler,
  answerAudioHandler,
  updateStatusHandler,
} from "./applications.controller";

const router = Router();

router.post("/", authMiddleware, requireRole("CANDIDATE"), requireVerifiedEmail, aiLimiter, applyHandler);
router.get("/mine", authMiddleware, requireRole("CANDIDATE"), listMineHandler);
router.get("/job/:jobId", authMiddleware, requireRole("RECRUITER"), listApplicantsHandler);
router.get("/:id", authMiddleware, requireRole("RECRUITER"), detailHandler);
router.get("/:id/resume", authMiddleware, requireRole("RECRUITER"), resumeFileHandler);
router.get("/:id/answers/:answerId/audio", authMiddleware, requireRole("RECRUITER"), answerAudioHandler);
router.patch("/:id/status", authMiddleware, requireRole("RECRUITER"), updateStatusHandler);

export default router;
