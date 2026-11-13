import fs from "fs";
import { Response } from "express";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma";
import { AuthRequest } from "../../shared/authMiddleware";
import { badRequest } from "../../shared/errors";
import { getParam } from "../../shared/http";
import * as interviewsService from "./interviews.service";

const startSchema = z.object({ applicationId: z.string().uuid() });

/** Multipart fields arrive as strings; a JSON body arrives already parsed. Accepts either. */
const jsonField = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }, schema);

/** How the answer was spoken, measured in the browser. All optional: older clients send none of it. */
const voiceMetricsSchema = z.object({
  /** Silence between the question finishing and the first recognised word */
  latencyMs: z.number().min(0).max(600_000).optional(),
  speakingMs: z.number().min(0).max(3_600_000).optional(),
  wordCount: z.number().int().min(0).max(5_000).optional(),
  longPauses: z.number().int().min(0).max(1_000).optional(),
  edited: z.boolean().optional(),
});

const answerSchema = z.object({
  questionId: z.string().uuid(),
  answerText: z.string().trim().min(1, "Answer can't be empty").max(5000),
  timeTakenSeconds: z.number().positive().max(24 * 60 * 60),
  rawTranscript: z.string().max(5000).optional(),
  voiceMetrics: voiceMetricsSchema.optional(),
});

const audioAnswerSchema = z.object({
  questionId: z.string().uuid(),
  /** Supplied when the browser recognised the speech itself, which skips the Gemini transcription */
  transcript: z.string().trim().max(5000).optional(),
  rawTranscript: z.string().max(5000).optional(),
  timeTakenSeconds: z.coerce.number().positive().max(24 * 60 * 60).optional(),
  voiceMetrics: jsonField(voiceMetricsSchema).optional(),
});
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
  const { questionId, answerText, timeTakenSeconds, rawTranscript, voiceMetrics } = answerSchema.parse(req.body);
  const result = await interviewsService.submitAnswer(req.user!.userId, getParam(req, "sessionId"), {
    questionId,
    answerText,
    timeTakenSeconds,
    rawTranscript: rawTranscript ?? null,
    voiceMetrics: (voiceMetrics as Prisma.InputJsonValue | undefined) ?? null,
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
    const { questionId, transcript, rawTranscript, timeTakenSeconds, voiceMetrics } = audioAnswerSchema.parse(req.body);
    // Keys are omitted rather than passed as undefined, which exactOptionalPropertyTypes rejects
    const result = await interviewsService.submitAudioAnswer(
      req.user!.userId,
      getParam(req, "sessionId"),
      questionId,
      file,
      {
        ...(transcript === undefined ? {} : { transcript }),
        ...(rawTranscript === undefined ? {} : { rawTranscript }),
        ...(timeTakenSeconds === undefined ? {} : { timeTakenSeconds }),
        ...(voiceMetrics === undefined ? {} : { voiceMetrics: voiceMetrics as Prisma.InputJsonValue }),
      }
    );
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
