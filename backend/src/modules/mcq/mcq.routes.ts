import { Router } from "express";
import { authMiddleware, requireRole } from "../../shared/authMiddleware";
import {
  addQuestionsHandler,
  deleteQuestionHandler,
  eventHandler,
  getAttemptHandler,
  getTestHandler,
  importQuestionsHandler,
  overviewHandler,
  recruiterResultHandler,
  saveAnswerHandler,
  saveTestHandler,
  startHandler,
  submitHandler,
  updateQuestionHandler,
} from "./mcq.controller";

const router = Router();
const recruiter = [authMiddleware, requireRole("RECRUITER")];
const candidate = [authMiddleware, requireRole("CANDIDATE")];

router.get("/jobs/:jobId/test", ...recruiter, getTestHandler);
router.put("/jobs/:jobId/test", ...recruiter, saveTestHandler);
router.post("/jobs/:jobId/questions", ...recruiter, addQuestionsHandler);
router.post("/jobs/:jobId/questions/import", ...recruiter, importQuestionsHandler);
router.put("/questions/:questionId", ...recruiter, updateQuestionHandler);
router.delete("/questions/:questionId", ...recruiter, deleteQuestionHandler);
router.get("/applications/:applicationId/result", ...recruiter, recruiterResultHandler);

router.get("/applications/:applicationId", ...candidate, overviewHandler);
router.post("/applications/:applicationId/start", ...candidate, startHandler);
router.get("/attempts/:attemptId", ...candidate, getAttemptHandler);
router.put("/attempts/:attemptId/answers/:questionId", ...candidate, saveAnswerHandler);
router.post("/attempts/:attemptId/submit", ...candidate, submitHandler);
router.post("/attempts/:attemptId/events", ...candidate, eventHandler);

export default router;
