import { Router } from "express";
import { authMiddleware, requireRole, requireVerifiedEmail } from "../../shared/authMiddleware";
import { aiLimiter } from "../../shared/rateLimits";
import {
  createHandler,
  listMineHandler,
  listAllHandler,
  getOneHandler,
  updateHandler,
  statusHandler,
  deleteHandler,
} from "./jobs.controller";

const router = Router();

// Creating or editing a job generates an embedding, so both count toward the AI limit
router.post("/", authMiddleware, requireRole("RECRUITER"), requireVerifiedEmail, aiLimiter, createHandler);
router.get("/mine", authMiddleware, requireRole("RECRUITER"), listMineHandler);
router.patch("/:id", authMiddleware, requireRole("RECRUITER"), aiLimiter, updateHandler);
router.patch("/:id/status", authMiddleware, requireRole("RECRUITER"), statusHandler);
router.delete("/:id", authMiddleware, requireRole("RECRUITER"), deleteHandler);
router.get("/", listAllHandler);          // public — candidates browse jobs, no login required
router.get("/:id", getOneHandler);         // public — view one job's details

export default router;
