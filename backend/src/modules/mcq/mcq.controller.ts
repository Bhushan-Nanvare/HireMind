import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../../shared/authMiddleware";
import { getParam } from "../../shared/http";
import * as attempts from "./attempt.service";
import * as authoring from "./authoring.service";

const settingsSchema = z.object({
  title: z.string().trim().min(1, "Give the assessment a title").max(120),
  durationMinutes: z.number().int().min(1).max(240),
  questionCount: z.number().int().min(1).max(100),
  passPercent: z.number().int().min(0).max(100),
  showResult: z.boolean(),
  published: z.boolean(),
});

const questionSchema = z
  .object({
    text: z.string().trim().min(1, "The question can't be empty").max(1000),
    options: z.array(z.string().trim().min(1, "Options can't be empty").max(300)).min(2).max(6),
    correct: z.array(z.number().int().min(0)).min(1, "Pick at least one correct answer"),
    topic: z.string().trim().max(60).optional(),
  })
  .refine((q) => q.correct.every((index) => index < q.options.length) && new Set(q.correct).size === q.correct.length, {
    message: "The correct answers must be distinct options of the question",
    path: ["correct"],
  });

const questionsSchema = z.object({ questions: z.array(questionSchema).min(1).max(200) });
const importSchema = z.object({ csv: z.string().min(1, "Paste or choose a CSV first").max(90_000) });
const answerSchema = z.object({ selected: z.array(z.number().int().min(0).max(5)).max(6) });
const eventSchema = z.object({ eventType: z.enum(["TAB_SWITCH", "COPY_PASTE"]) });

const userId = (req: AuthRequest) => req.user!.userId;

export async function getTestHandler(req: AuthRequest, res: Response) {
  res.json({ success: true, data: await authoring.getTestForRecruiter(userId(req), getParam(req, "jobId")) });
}

export async function saveTestHandler(req: AuthRequest, res: Response) {
  await authoring.saveTest(userId(req), getParam(req, "jobId"), settingsSchema.parse(req.body));
  res.json({ success: true });
}

export async function addQuestionsHandler(req: AuthRequest, res: Response) {
  const { questions } = questionsSchema.parse(req.body);
  res.status(201).json({ success: true, data: await authoring.addQuestions(userId(req), getParam(req, "jobId"), questions) });
}

export async function importQuestionsHandler(req: AuthRequest, res: Response) {
  const { csv } = importSchema.parse(req.body);
  res.status(201).json({ success: true, data: await authoring.importQuestions(userId(req), getParam(req, "jobId"), csv) });
}

export async function updateQuestionHandler(req: AuthRequest, res: Response) {
  await authoring.updateQuestion(userId(req), getParam(req, "questionId"), questionSchema.parse(req.body));
  res.json({ success: true });
}

export async function deleteQuestionHandler(req: AuthRequest, res: Response) {
  await authoring.deleteQuestion(userId(req), getParam(req, "questionId"));
  res.json({ success: true });
}

export async function recruiterResultHandler(req: AuthRequest, res: Response) {
  res.json({ success: true, data: await authoring.getAssessmentResult(userId(req), getParam(req, "applicationId")) });
}

export async function overviewHandler(req: AuthRequest, res: Response) {
  res.json({ success: true, data: await attempts.getAssessmentOverview(userId(req), getParam(req, "applicationId")) });
}

export async function startHandler(req: AuthRequest, res: Response) {
  res.json({ success: true, data: await attempts.startAttempt(userId(req), getParam(req, "applicationId")) });
}

export async function getAttemptHandler(req: AuthRequest, res: Response) {
  res.json({ success: true, data: await attempts.getAttempt(userId(req), getParam(req, "attemptId")) });
}

export async function saveAnswerHandler(req: AuthRequest, res: Response) {
  const { selected } = answerSchema.parse(req.body);
  await attempts.saveAnswer(userId(req), getParam(req, "attemptId"), getParam(req, "questionId"), selected);
  res.json({ success: true });
}

export async function submitHandler(req: AuthRequest, res: Response) {
  res.json({ success: true, data: await attempts.submitAttempt(userId(req), getParam(req, "attemptId")) });
}

export async function eventHandler(req: AuthRequest, res: Response) {
  const { eventType } = eventSchema.parse(req.body);
  await attempts.logAttemptEvent(userId(req), getParam(req, "attemptId"), eventType);
  res.status(201).json({ success: true });
}
