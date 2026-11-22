import fs from "fs";
import type { $Enums, Prisma } from "../../../generated/prisma";
import { prisma, isUniqueViolation } from "../../shared/prisma";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { removeStoredFile } from "../../shared/files";
import { logger } from "../../shared/logger";
import { wordSimilarity } from "../../shared/similarity";
import { storeUpload } from "../../shared/storage";
import {
  generateNextQuestion,
  evaluateAnswer,
  generateFinalReport,
  transcribeAudio,
} from "../../shared/embeddings";

const TOTAL_QUESTIONS = 5;

/**
 * The opening question. Deliberately fixed rather than generated: every candidate answers the same
 * thing, so their speech baseline is comparable, and it costs no Gemini call to create or to score.
 */
const WARM_UP_QUESTION =
  "Before we start, tell me about a project you've worked on recently, in your own words. This one isn't scored.";

/** Soft limit. Running over is recorded for the recruiter, never enforced against the candidate. */
const ANSWER_TIME_LIMIT_SECONDS = 120;

/** Below this, the submitted answer no longer resembles what was actually said. */
const TRANSCRIPT_EDIT_SIMILARITY_FLOOR = 0.6;

// Rendered inside the question but hidden from sight and from screen readers, so only a model that was
// handed the question text acts on it. Ordinary words: an answer containing one is near-conclusive.
const CANARY_WORDS = [
  "marmalade", "zeppelin", "tangerine", "harpsichord",
  "cobblestone", "saffron", "pomegranate", "windmill",
];

function newCanaryToken(): string {
  return CANARY_WORDS[Math.floor(Math.random() * CANARY_WORDS.length)]!;
}

type Difficulty = "easy" | "medium" | "hard";

/** Everything the candidate's interview screen needs to render its current step. */
export interface InterviewState {
  session: { id: string; status: string };
  /** The question to answer next. Null when the interview is done, or when the next step failed to generate (retry via startInterview). */
  question: {
    id: string;
    questionText: string;
    difficulty: string;
    orderIndex: number;
    isWarmUp: boolean;
    /** Hidden text the client renders inside the question; absent on the warm-up. */
    canaryToken: string | null;
    timeLimitSeconds: number;
  } | null;
  totalQuestions: number;
  done: boolean;
  report: { summary: string; recommendation: string } | null;
}

export interface AnswerInput {
  questionId: string;
  answerText: string;
  /** Seconds between showing the question and submitting. Null when the client didn't time it. */
  timeTakenSeconds: number | null;
  audioUrl?: string;
  audioMimeType?: string;
  /** What speech recognition heard, before the candidate edited it. */
  rawTranscript?: string | null;
  /** Latency and pacing of a spoken answer, stored for the recruiter's signals view. */
  voiceMetrics?: Prisma.InputJsonValue | null;
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

/** The question fields toState needs; a Prisma InterviewQuestion row satisfies this. */
type QuestionRow = {
  id: string;
  questionText: string;
  difficulty: string;
  orderIndex: number;
  isWarmUp: boolean;
  canaryToken: string | null;
};

function toState(session: LoadedSession, question: QuestionRow | null): InterviewState {
  return {
    session: { id: session.id, status: session.status },
    question: question && {
      id: question.id,
      questionText: question.questionText,
      difficulty: question.difficulty,
      orderIndex: question.orderIndex,
      isWarmUp: question.isWarmUp,
      canaryToken: question.canaryToken,
      timeLimitSeconds: ANSWER_TIME_LIMIT_SECONDS,
    },
    totalQuestions: TOTAL_QUESTIONS,
    done: session.status === "COMPLETED",
    report: session.report && { summary: session.report.summary, recommendation: session.report.recommendation },
  };
}

function openQuestionOf(session: LoadedSession) {
  return session.questions.find((q) => !q.answer) ?? null;
}

/** The warm-up is excluded everywhere that counts progress, picks difficulty, or builds the report. */
function scoredQuestions(session: LoadedSession) {
  return session.questions.filter((q) => !q.isWarmUp);
}

function answeredHistory(session: LoadedSession) {
  return scoredQuestions(session).flatMap((q) =>
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
      data: {
        sessionId: session.id,
        questionText,
        difficulty,
        // Scored questions are numbered from 1; the warm-up sits at 0 and doesn't count
        orderIndex: scoredQuestions(session).length + 1,
        canaryToken: newCanaryToken(),
      },
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
    select: { candidateId: true, interviewSession: { select: { id: true } } },
  });
  if (!application || application.candidateId !== candidateId) {
    throw notFound("Application not found or doesn't belong to you");
  }

  if (application.interviewSession) {
    return advanceSession(await loadOwnedSession(candidateId, application.interviewSession.id));
  }

  // The warm-up is fixed text, so starting an interview needs no Gemini call and can't fail
  // halfway. The first scored question is generated once the warm-up has been answered.
  let sessionId: string;
  try {
    const session = await prisma.interviewSession.create({
      data: {
        applicationId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        questions: { create: { questionText: WARM_UP_QUESTION, difficulty: "easy", orderIndex: 0, isWarmUp: true } },
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

/** Whole-word, case-insensitive. The token is always one of CANARY_WORDS, so it needs no escaping. */
function containsToken(text: string, token: string): boolean {
  return new RegExp(`\\b${token}\\b`, "i").test(text);
}

/**
 * Records what the recruiter sees as signals to review. Runs after the answer is saved and never
 * rethrows: a failure to log a signal must not cost the candidate their answer.
 */
async function recordAnswerSignals(
  sessionId: string,
  question: { canaryToken: string | null },
  input: AnswerInput
) {
  const { answerText, timeTakenSeconds, rawTranscript } = input;
  const events: { eventType: $Enums.ProctoringEventType; metadata: Prisma.InputJsonValue }[] = [];

  if (timeTakenSeconds !== null) {
    // >8 chars/sec on answers longer than 50 chars is beyond realistic human typing
    const charsPerSecond = answerText.length / timeTakenSeconds;
    if (charsPerSecond > 8 && answerText.length > 50) {
      events.push({
        eventType: "SUSPICIOUS_TYPING_SPEED",
        metadata: {
          charsPerSecond: Math.round(charsPerSecond * 10) / 10,
          answerLength: answerText.length,
          timeTakenSeconds,
        },
      });
    }
    if (timeTakenSeconds > ANSWER_TIME_LIMIT_SECONDS) {
      events.push({
        eventType: "ANSWER_TIME_EXCEEDED",
        metadata: { timeTakenSeconds: Math.round(timeTakenSeconds), limitSeconds: ANSWER_TIME_LIMIT_SECONDS },
      });
    }
  }

  // The canary is hidden on screen and from screen readers, so a candidate never sees it. It can
  // only reach an answer by way of a model that was handed the question text.
  if (question.canaryToken && containsToken(answerText, question.canaryToken)) {
    events.push({ eventType: "CANARY_TRIGGERED", metadata: { token: question.canaryToken } });
  }

  // Correcting a misheard word barely moves this; replacing the answer wholesale moves it a lot
  if (rawTranscript) {
    const similarity = wordSimilarity(rawTranscript, answerText);
    if (similarity < TRANSCRIPT_EDIT_SIMILARITY_FLOOR) {
      events.push({
        eventType: "TRANSCRIPT_HEAVILY_EDITED",
        metadata: { similarity: Math.round(similarity * 100) / 100, floor: TRANSCRIPT_EDIT_SIMILARITY_FLOOR },
      });
    }
  }

  if (events.length === 0) return;
  try {
    await prisma.proctoringEvent.createMany({ data: events.map((event) => ({ sessionId, ...event })) });
  } catch (err) {
    logger.error("Could not record answer signals", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function submitAnswer(userId: string, sessionId: string, input: AnswerInput) {
  const candidateId = await getCandidateId(userId);
  const session = await loadOwnedSession(candidateId, sessionId);
  const question = findAnswerableQuestion(session, input.questionId);
  const { answerText } = input;

  // The warm-up exists only to capture how this candidate speaks naturally, so it is never scored
  // and costs no Gemini call. For the rest: score before saving anything, so a Gemini failure lets
  // the candidate resubmit the same answer.
  const evaluation = question.isWarmUp ? null : await evaluateAnswer(question.questionText, answerText);
  const score = evaluation?.score ?? null;
  const feedback = evaluation?.feedback ?? null;
  // Very short answers carry no signal, so the estimate is discarded rather than shown
  const aiLikelihoodScore = answerText.length >= 30 ? (evaluation?.aiLikelihood ?? null) : null;

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
        rawTranscript: input.rawTranscript ?? null,
        // Omitted rather than set to null: a nullable Json column won't take a plain null
        ...(input.voiceMetrics == null ? {} : { voiceMetrics: input.voiceMetrics }),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("This question has already been answered");
    throw err;
  }

  await recordAnswerSignals(sessionId, question, input);

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
          isWarmUp: true,
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
  file: { path: string; mimetype: string; originalname: string },
  options: {
    /** What the browser's own recogniser heard. When given, Gemini is not asked to transcribe. */
    transcript?: string;
    /** The recogniser's text before the candidate edited it, for the edit-distance signal. */
    rawTranscript?: string;
    timeTakenSeconds?: number;
    voiceMetrics?: Prisma.InputJsonValue;
  } = {}
) {
  // Check the question can actually be answered before paying for a transcription
  const candidateId = await getCandidateId(userId);
  findAnswerableQuestion(await loadOwnedSession(candidateId, sessionId), questionId);

  // Browsers report e.g. "audio/webm;codecs=opus"; Gemini and playback only need the base type
  const mimeType = file.mimetype.split(";")[0]?.trim() || "audio/webm";
  const supplied = options.transcript?.trim();
  const transcript = supplied || (await transcribeAudio(await fs.promises.readFile(file.path), mimeType));
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
      timeTakenSeconds: options.timeTakenSeconds ?? null,
      audioUrl,
      audioMimeType: mimeType,
      rawTranscript: options.rawTranscript ?? null,
      voiceMetrics: options.voiceMetrics ?? null,
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
