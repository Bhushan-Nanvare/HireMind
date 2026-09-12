import fs from "fs";
import { Response } from "express";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma";
import { AuthRequest } from "../../shared/authMiddleware";
import { badRequest } from "../../shared/errors";
import { getParam } from "../../shared/http";
import * as interviewsService from "./interviews.service";

const startSchema = z.object({ applicationId: z.string().uuid() });
const answerSchema = z.object({
  questionId: z.string().uuid(),
  answerText: z.string().trim().min(1, "Answer can't be empty").max(5000),
  timeTakenSeconds: z.number().positive().max(24 * 60 * 60),
});
const audioAnswerSchema = z.object({ questionId: z.string().uuid() });
// Events the browser reports. SUSPICIOUS_TYPING_SPEED is detected server-side, so clients can't send it.
const proctoringSchema = z.object({
  eventType: z.enum(["TAB_SWITCH", "COPY_PASTE", "PASTE_BLOCKED_IN_ANSWER"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Starts the interview, or resumes it if it was already started
export async function startHandler(req: AuthRequest, res: Response) {
  const { applicationId } = startSchema.parse(req.body);
  const state = await interviewsService.startInterview(req.user!.userId, applicationId);
  res.json({ success: true, data: state });
}

// The interview's current state without starting it: `interview` is null until the candidate starts
export async function stateHandler(req: AuthRequest, res: Response) {
  const result = await interviewsService.getInterviewForApplication(req.user!.userId, getParam(req, "applicationId"));
  res.json({ success: true, data: result });
}

export async function answerHandler(req: AuthRequest, res: Response) {
  const { questionId, answerText, timeTakenSeconds } = answerSchema.parse(req.body);
  const result = await interviewsService.submitAnswer(req.user!.userId, getParam(req, "sessionId"), {
    questionId,
    answerText,
    timeTakenSeconds,
  });
  res.json({ success: true, data: result });
}

export async function getSessionHandler(req: AuthRequest, res: Response) {
  const session = await interviewsService.getSession(req.user!.userId, getParam(req, "sessionId"));
  res.json({ success: true, data: session });
}

export async function audioAnswerHandler(req: AuthRequest, res: Response) {
  const file = req.file;
  if (!file) throw badRequest('No audio uploaded. Send the recording in the "audio" field.');

  try {
    const { questionId } = audioAnswerSchema.parse(req.body);
    const result = await interviewsService.submitAudioAnswer(req.user!.userId, getParam(req, "sessionId"), questionId, file);
    res.json({ success: true, data: result });
  } catch (err) {
    // Only recordings that became saved answers are kept
    await fs.promises.rm(file.path, { force: true });
    throw err;
  }
}

export async function proctoringHandler(req: AuthRequest, res: Response) {
  const { eventType, metadata } = proctoringSchema.parse(req.body);
  await interviewsService.logProctoringEvent(
    req.user!.userId,
    getParam(req, "sessionId"),
    eventType,
    metadata as Prisma.InputJsonValue | undefined
  );
  res.status(201).json({ success: true });
}
