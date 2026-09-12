import fs from "fs";
import type { $Enums, Prisma } from "../../../generated/prisma";
import { prisma, isUniqueViolation } from "../../shared/prisma";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { removeStoredFile } from "../../shared/files";
import { logger } from "../../shared/logger";
import { storeUpload } from "../../shared/storage";
import {
  generateNextQuestion,
  evaluateAnswer,
  generateFinalReport,
  transcribeAudio,
  analyzeAnswerAuthenticity,
} from "../../shared/embeddings";

const TOTAL_QUESTIONS = 5;

type Difficulty = "easy" | "medium" | "hard";

/** Everything the candidate's interview screen needs to render its current step. */
export interface InterviewState {
  session: { id: string; status: string };
  /** The question to answer next. Null when the interview is done, or when the next step failed to generate (retry via startInterview). */
  question: { id: string; questionText: string; difficulty: string; orderIndex: number } | null;
  totalQuestions: number;
  done: boolean;
  report: { summary: string; recommendation: string } | null;
}

export interface AnswerInput {
  questionId: string;
  answerText: string;
  /** Seconds between showing the question and submitting. Null for audio answers, which have no typing to time. */
  timeTakenSeconds: number | null;
  audioUrl?: string;
  audioMimeType?: string;
}

async function getCandidateId(userId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
  if (!candidate) throw notFound("Candidate profile not found");
  return candidate.id;
}

async function loadOwnedSession(candidateId: string, sessionId: string) {
  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: {
      application: {
        include: {
          resume: { omit: { embedding: true } },
          jobPosting: { omit: { embedding: true } },
          skillGaps: true,
        },
      },
      questions: { include: { answer: true }, orderBy: { orderIndex: "asc" } },
      report: true,
    },
  });
  if (!session || session.application.candidateId !== candidateId) {
    throw notFound("Session not found or doesn't belong to you");
  }
  return session;
}

type LoadedSession = Awaited<ReturnType<typeof loadOwnedSession>>;

function toState(session: LoadedSession, question: InterviewState["question"]): InterviewState {
  return {
    session: { id: session.id, status: session.status },
    question: question && {
      id: question.id,
      questionText: question.questionText,
      difficulty: question.difficulty,
      orderIndex: question.orderIndex,
    },
    totalQuestions: TOTAL_QUESTIONS,
    done: session.status === "COMPLETED",
    report: session.report && { summary: session.report.summary, recommendation: session.report.recommendation },
  };
}

function openQuestionOf(session: LoadedSession) {
  return session.questions.find((q) => !q.answer) ?? null;
}

function answeredHistory(session: LoadedSession) {
  return session.questions.flatMap((q) =>
    q.answer ? [{ question: q.questionText, answer: q.answer.answerText, score: q.answer.score ?? 0 }] : []
  );
}

function nextDifficulty(lastScore: number | undefined): Difficulty {
  if (lastScore === undefined) return "medium";
  return lastScore >= 7 ? "hard" : lastScore <= 4 ? "easy" : "medium";
}

function findAnswerableQuestion(session: LoadedSession, questionId: string) {
  if (session.status !== "IN_PROGRESS") throw conflict("This interview session is not active");
  const question = session.questions.find((q) => q.id === questionId);
  if (!question) throw notFound("Question not found in this session");
  if (question.answer) throw conflict("This question has already been answered");
  return question;
}

/**
 * Moves a session to its next actionable step: returns the open question if there is one, otherwise
 * generates the next question or, after the last answer, the final report. This is also what recovers
 * a session where an earlier request saved an answer but failed before generating what comes next.
 */
async function advanceSession(session: LoadedSession): Promise<InterviewState> {
  if (session.status === "COMPLETED") return toState(session, null);

  const openQuestion = openQuestionOf(session);
  if (openQuestion) return toState(session, openQuestion);

  const { application } = session;
  const history = answeredHistory(session);

  if (history.length >= TOTAL_QUESTIONS) {
    const { summary, recommendation } = await generateFinalReport({
      jobDescription: application.jobPosting.description,
      qaHistory: history,
    });
    try {
      // Nested create: the report and the COMPLETED status are written atomically
      await prisma.interviewSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED", endedAt: new Date(), report: { create: { summary, recommendation } } },
      });
    } catch (err) {
      // A concurrent request already completed the report; return that one
      if (!isUniqueViolation(err)) throw err;
    }
    return toState(await loadOwnedSession(application.candidateId, session.id), null);
  }

  const difficulty = nextDifficulty(history.at(-1)?.score);
  const questionText = await generateNextQuestion({
    resumeText: application.resume.parsedText ?? "",
    jobDescription: application.jobPosting.description,
    skillGaps: application.skillGaps.map((g) => g.missingSkill),
    previousQA: history,
    difficulty,
  });
  try {
    const question = await prisma.interviewQuestion.create({
      data: { sessionId: session.id, questionText, difficulty, orderIndex: session.questions.length + 1 },
    });
    return toState(session, question);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // A concurrent request already created this question; return whatever is open now
    const fresh = await loadOwnedSession(application.candidateId, session.id);
    return toState(fresh, openQuestionOf(fresh));
  }
}

/**
 * The interview for an application without starting it or calling Gemini, plus the job it's for.
 * `interview` is null until the candidate starts.
 */
export async function getInterviewForApplication(userId: string, applicationId: string) {
  const candidateId = await getCandidateId(userId);
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      candidateId: true,
      jobPosting: { select: { title: true, recruiter: { select: { companyName: true } } } },
      interviewSession: { select: { id: true } },
    },
  });
  if (!application || application.candidateId !== candidateId) {
    throw notFound("Application not found or doesn't belong to you");
  }

  let interview: InterviewState | null = null;
  if (application.interviewSession) {
    const session = await loadOwnedSession(candidateId, application.interviewSession.id);
    interview = toState(session, openQuestionOf(session));
  }
  return {
    jobTitle: application.jobPosting.title,
    companyName: application.jobPosting.recruiter.companyName,
    interview,
  };
}

/** Starts the interview for an application, or resumes it where the candidate left off. */
export async function startInterview(userId: string, applicationId: string): Promise<InterviewState> {
  const candidateId = await getCandidateId(userId);

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      resume: { omit: { embedding: true } },
      jobPosting: { omit: { embedding: true } },
      skillGaps: true,
      interviewSession: { select: { id: true } },
    },
  });
  if (!application || application.candidateId !== candidateId) {
    throw notFound("Application not found or doesn't belong to you");
  }

  if (application.interviewSession) {
    return advanceSession(await loadOwnedSession(candidateId, application.interviewSession.id));
  }

  // Generate the first question before creating the session, so a Gemini failure can't leave an
  // empty session behind that blocks the interview forever.
  const questionText = await generateNextQuestion({
    resumeText: application.resume.parsedText ?? "",
    jobDescription: application.jobPosting.description,
    skillGaps: application.skillGaps.map((g) => g.missingSkill),
    previousQA: [],
    difficulty: "medium",
  });

  let sessionId: string;
  try {
    const session = await prisma.interviewSession.create({
      data: {
        applicationId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        questions: { create: { questionText, difficulty: "medium", orderIndex: 1 } },
      },
      select: { id: true },
    });
    sessionId = session.id;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // A concurrent request (e.g. a double click) created the session first: resume that one
    const existing = await prisma.interviewSession.findUniqueOrThrow({ where: { applicationId }, select: { id: true } });
    sessionId = existing.id;
  }
  return advanceSession(await loadOwnedSession(candidateId, sessionId));
}

export async function submitAnswer(userId: string, sessionId: string, input: AnswerInput) {
  const candidateId = await getCandidateId(userId);
  const session = await loadOwnedSession(candidateId, sessionId);
  const question = findAnswerableQuestion(session, input.questionId);
  const { answerText, timeTakenSeconds } = input;

  // Score before saving anything: if Gemini fails, the candidate can resubmit the same answer.
  // AI-likeness is skipped for very short answers, where the score would be meaningless.
  const [{ score, feedback }, aiLikelihoodScore] = await Promise.all([
    evaluateAnswer(question.questionText, answerText),
    answerText.length >= 30 ? analyzeAnswerAuthenticity(answerText) : Promise.resolve(null),
  ]);

  try {
    await prisma.interviewAnswer.create({
      data: {
        questionId: question.id,
        answerText,
        score,
        feedback,
        aiLikelihoodScore,
        audioUrl: input.audioUrl ?? null,
        audioMimeType: input.audioMimeType ?? null,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("This question has already been answered");
    throw err;
  }

  // Typing-speed flag: >8 chars/sec on answers longer than 50 chars is beyond realistic human speed
  if (timeTakenSeconds !== null) {
    const charsPerSecond = answerText.length / timeTakenSeconds;
    if (charsPerSecond > 8 && answerText.length > 50) {
      await prisma.proctoringEvent.create({
        data: {
          sessionId,
          eventType: "SUSPICIOUS_TYPING_SPEED",
          metadata: {
            charsPerSecond: Math.round(charsPerSecond * 10) / 10,
            answerLength: answerText.length,
            timeTakenSeconds,
          },
        },
      });
    }
  }

  const updated = await loadOwnedSession(candidateId, sessionId);
  try {
    return { ...(await advanceSession(updated)), score, feedback };
  } catch (err) {
    // The answer is saved, but the next question or report couldn't be generated. The client offers
    // a retry that calls startInterview, which picks up from exactly this point.
    logger.error("Could not advance interview session", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ...toState(updated, null), score, feedback };
  }
}

/** The candidate's own view of a session: questions, their answers with scores and feedback, and the report. */
export async function getSession(userId: string, sessionId: string) {
  const candidateId = await getCandidateId(userId);

  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      endedAt: true,
      application: { select: { candidateId: true } },
      questions: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          questionText: true,
          difficulty: true,
          orderIndex: true,
          answer: { select: { answerText: true, score: true, feedback: true, audioUrl: true } },
        },
      },
      report: { select: { summary: true, recommendation: true } },
    },
  });
  if (!session || session.application.candidateId !== candidateId) {
    throw notFound("Session not found or doesn't belong to you");
  }
  // Anti-cheat signals (proctoring events, AI-likeness scores) are for recruiters only
  const { application: _owner, questions, ...visible } = session;
  return {
    ...visible,
    questions: questions.map(({ answer, ...question }) => ({
      ...question,
      answer: answer && {
        answerText: answer.answerText,
        score: answer.score,
        feedback: answer.feedback,
        isVoice: answer.audioUrl !== null,
      },
    })),
  };
}

export async function submitAudioAnswer(
  userId: string,
  sessionId: string,
  questionId: string,
  file: { path: string; mimetype: string; originalname: string }
) {
  // Check the question can actually be answered before paying for a transcription
  const candidateId = await getCandidateId(userId);
  findAnswerableQuestion(await loadOwnedSession(candidateId, sessionId), questionId);

  // Browsers report e.g. "audio/webm;codecs=opus"; Gemini and playback only need the base type
  const mimeType = file.mimetype.split(";")[0]?.trim() || "audio/webm";
  const transcript = await transcribeAudio(await fs.promises.readFile(file.path), mimeType);
  if (!transcript) throw badRequest("No speech could be recognised in the recording. Please try again.");

  // Kept so the recruiter can listen to the answer
  const audioUrl = await storeUpload(file.path, {
    folder: "audio",
    contentType: mimeType,
    fileName: file.originalname,
  });
  try {
    return await submitAnswer(userId, sessionId, {
      questionId,
      answerText: transcript,
      timeTakenSeconds: null,
      audioUrl,
      audioMimeType: mimeType,
    });
  } catch (err) {
    await removeStoredFile(audioUrl);
    throw err;
  }
}

export async function logProctoringEvent(
  userId: string,
  sessionId: string,
  eventType: $Enums.ProctoringEventType,
  metadata?: Prisma.InputJsonValue
) {
  const candidateId = await getCandidateId(userId);

  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: { application: true },
  });
  if (!session || session.application.candidateId !== candidateId) {
    throw notFound("Session not found or doesn't belong to you");
  }

  return prisma.proctoringEvent.create({
    data: metadata === undefined ? { sessionId, eventType } : { sessionId, eventType, metadata },
  });
}
