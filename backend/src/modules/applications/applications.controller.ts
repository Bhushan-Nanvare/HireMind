import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../../shared/authMiddleware";
import { sendStoredFile } from "../../shared/files";
import { getParam } from "../../shared/http";
import * as applicationsService from "./applications.service";

const applySchema = z.object({
  jobId: z.string().uuid(),
  resumeId: z.string().uuid(),
});

const statusSchema = z.object({ status: z.enum(["APPLIED", "SHORTLISTED", "REJECTED"]) });

export async function applyHandler(req: AuthRequest, res: Response) {
  const { jobId, resumeId } = applySchema.parse(req.body);
  const application = await applicationsService.applyToJob(req.user!.userId, jobId, resumeId);
  res.status(201).json({ success: true, data: application });
}

export async function listMineHandler(req: AuthRequest, res: Response) {
  const applications = await applicationsService.listMyApplications(req.user!.userId);
  res.json({ success: true, data: applications });
}

export async function listApplicantsHandler(req: AuthRequest, res: Response) {
  const result = await applicationsService.listApplicantsForJob(req.user!.userId, getParam(req, "jobId"));
  res.json({ success: true, data: result });
}

export async function detailHandler(req: AuthRequest, res: Response) {
  const application = await applicationsService.getApplicationForRecruiter(req.user!.userId, getParam(req, "id"));
  res.json({ success: true, data: application });
}

export async function resumeFileHandler(req: AuthRequest, res: Response) {
  const file = await applicationsService.getApplicantResumeFile(req.user!.userId, getParam(req, "id"));
  await sendStoredFile(res, file.ref, { contentType: "application/pdf", fileName: file.fileName });
}

export async function answerAudioHandler(req: AuthRequest, res: Response) {
  const audio = await applicationsService.getAnswerAudio(req.user!.userId, getParam(req, "id"), getParam(req, "answerId"));
  await sendStoredFile(res, audio.ref, { contentType: audio.contentType, fileName: "answer-recording" });
}

export async function updateStatusHandler(req: AuthRequest, res: Response) {
  const { status } = statusSchema.parse(req.body);
  const application = await applicationsService.updateApplicationStatus(req.user!.userId, getParam(req, "id"), status);
  res.json({ success: true, data: application });
}
