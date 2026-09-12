import { Router } from "express";
import { authMiddleware, requireRole } from "../../shared/authMiddleware";
import { aiLimiter } from "../../shared/rateLimits";
import { audioUpload } from "../../shared/uploads";
import {
  startHandler,
  stateHandler,
  answerHandler,
  audioAnswerHandler,
  getSessionHandler,
  proctoringHandler,
} from "./interviews.controller";

const router = Router();

// Start also resumes an existing interview; it counts toward the AI limit because it may generate a question
router.post("/start", authMiddleware, requireRole("CANDIDATE"), aiLimiter, startHandler);
// Read-only: never starts the interview or calls Gemini. Registered before "/:sessionId" so it isn't shadowed.
router.get("/by-application/:applicationId", authMiddleware, requireRole("CANDIDATE"), stateHandler);
router.post("/:sessionId/answer", authMiddleware, requireRole("CANDIDATE"), aiLimiter, answerHandler);
router.get("/:sessionId", authMiddleware, requireRole("CANDIDATE"), getSessionHandler);
router.post("/:sessionId/answer-audio", authMiddleware, requireRole("CANDIDATE"), aiLimiter, audioUpload.single("audio"), audioAnswerHandler);
router.post("/:sessionId/proctoring", authMiddleware, requireRole("CANDIDATE"), proctoringHandler);

export default router;
