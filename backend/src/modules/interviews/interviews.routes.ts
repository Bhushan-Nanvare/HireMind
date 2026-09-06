import { Router } from "express";
import multer from "multer";
import { authMiddleware, requireRole } from "../../shared/authMiddleware";
import { startHandler, answerHandler, audioAnswerHandler, getSessionHandler, proctoringHandler } from "./interviews.controller";

const router = Router();
const upload = multer({ dest: "uploads/audio/" });


router.post("/start", authMiddleware, requireRole("CANDIDATE"), startHandler);
router.post("/:sessionId/answer", authMiddleware, requireRole("CANDIDATE"), answerHandler);
router.get("/:sessionId", authMiddleware, requireRole("CANDIDATE"), getSessionHandler);
router.post("/:sessionId/answer-audio", authMiddleware, requireRole("CANDIDATE"), upload.single("audio"), audioAnswerHandler);
router.post("/:sessionId/proctoring", authMiddleware, requireRole("CANDIDATE"), proctoringHandler);
export default router;