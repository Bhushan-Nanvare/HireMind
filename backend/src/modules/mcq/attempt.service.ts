import type { $Enums, Prisma } from "../../../generated/prisma";
import { isUniqueViolation, prisma } from "../../shared/prisma";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { median, percentOf, sameSet, shuffle } from "./grading";

const MAX_EVENTS_PER_ATTEMPT = 100;
const FAST_ANSWER_MS = 3000;
const FAST_MIN_ANSWERED = 5;
const FAST_MIN_PERCENT = 70;

const attemptInclude = {
  test: true,
  application: { select: { candidateId: true } },
  questions: { orderBy: { orderIndex: "asc" }, include: { question: true } },
} satisfies Prisma.McqAttemptInclude;

type AttemptRow = Prisma.McqAttemptGetPayload<{ include: typeof attemptInclude }>;

async function getCandidateId(userId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
  if (!candidate) throw notFound("Candidate profile not found");
  return candidate.id;
}

function answeredGaps(startedAt: Date, questions: { answeredAt: Date | null }[]): number[] {
  const times = questions
    .flatMap((question) => (question.answeredAt ? [question.answeredAt.getTime()] : []))
    .sort((a, b) => a - b);
  return times.map((time, index) => time - (index === 0 ? startedAt.getTime() : (times[index - 1] as number)));
}

export async function finalizeAttempt(attemptId: string): Promise<void> {
  const attempt = await prisma.mcqAttempt.findUnique({
    where: { id: attemptId },
    include: { questions: { include: { question: { select: { correct: true } } } } },
  });
  if (!attempt || attempt.submittedAt) return;

  const now = new Date();
  const submittedAt = now > attempt.expiresAt ? attempt.expiresAt : now;
  const total = attempt.questions.length;
  const score = attempt.questions.filter((row) => sameSet(row.selected, row.question.correct)).length;

  const claimed = await prisma.mcqAttempt.updateMany({
    where: { id: attemptId, submittedAt: null },
    data: { submittedAt, score, total },
  });
  if (claimed.count === 0) return;

  const gaps = answeredGaps(attempt.startedAt, attempt.questions);
  const percent = percentOf(score, total);
  if (gaps.length >= FAST_MIN_ANSWERED && median(gaps) < FAST_ANSWER_MS && percent >= FAST_MIN_PERCENT) {
    await prisma.mcqEvent.create({
      data: {
        attemptId,
        eventType: "ANSWERED_TOO_FAST",
        metadata: { medianSeconds: Math.round(median(gaps) / 100) / 10, answered: gaps.length, percent },
      },
    });
  }
}

/** Grades attempts whose time ran out while the candidate was away. Called whenever results are read. */
export async function finalizeExpired(testId: string): Promise<void> {
  const stale = await prisma.mcqAttempt.findMany({
    where: { testId, submittedAt: null, expiresAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const { id } of stale) await finalizeAttempt(id);
}

export async function finalizeExpiredForJob(jobId: string): Promise<void> {
  const test = await prisma.mcqTest.findUnique({ where: { jobId }, select: { id: true } });
  if (test) await finalizeExpired(test.id);
}

async function loadOwnedAttempt(userId: string, attemptId: string): Promise<AttemptRow> {
  const candidateId = await getCandidateId(userId);
  const load = () => prisma.mcqAttempt.findUnique({ where: { id: attemptId }, include: attemptInclude });

  let attempt = await load();
  if (!attempt || attempt.application.candidateId !== candidateId) {
    throw notFound("Assessment not found or doesn't belong to you");
  }
  if (!attempt.submittedAt && attempt.expiresAt <= new Date()) {
    await finalizeAttempt(attemptId);
    attempt = (await load()) as AttemptRow;
  }
  return attempt;
}

function resultOf(attempt: AttemptRow) {
  if (attempt.score === null || attempt.total === null) return null;
  const percent = percentOf(attempt.score, attempt.total);
  return { score: attempt.score, total: attempt.total, percent, passed: percent >= attempt.test.passPercent };
}

function toView(attempt: AttemptRow, withQuestions: boolean) {
  const submitted = attempt.submittedAt !== null;
  return {
    id: attempt.id,
    status: submitted ? ("SUBMITTED" as const) : ("IN_PROGRESS" as const),
    title: attempt.test.title,
    expiresAt: attempt.expiresAt,
    secondsLeft: Math.max(0, Math.round((attempt.expiresAt.getTime() - Date.now()) / 1000)),
    result: submitted && attempt.test.showResult ? resultOf(attempt) : null,
    questions:
      withQuestions && !submitted
        ? attempt.questions.map((row) => ({
            id: row.questionId,
            text: row.question.text,
            options: row.optionOrder.map((original) => row.question.options[original] ?? ""),
            multiple: row.question.correct.length > 1,
            selected: row.selected.map((original) => row.optionOrder.indexOf(original)).filter((p) => p >= 0),
          }))
        : [],
  };
}

async function loadOwnedApplication(userId: string, applicationId: string) {
  const candidateId = await getCandidateId(userId);
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      candidateId: true,
      jobPosting: {
        select: {
          title: true,
          recruiter: { select: { companyName: true } },
          mcqTest: { include: { questions: { select: { id: true, options: true } } } },
        },
      },
      mcqAttempt: { select: { id: true } },
    },
  });
  if (!application || application.candidateId !== candidateId) {
    throw notFound("Application not found or doesn't belong to you");
  }
  return application;
}

export async function getAssessmentOverview(userId: string, applicationId: string) {
  const application = await loadOwnedApplication(userId, applicationId);
  const { title: jobTitle, recruiter, mcqTest: test } = application.jobPosting;
  const base = { jobTitle, companyName: recruiter.companyName };

  const attempt = application.mcqAttempt ? await loadOwnedAttempt(userId, application.mcqAttempt.id) : null;
  if (!test || (!test.published && !attempt?.submittedAt)) return { ...base, test: null, attempt: null };
  return {
    ...base,
    test: {
      title: test.title,
      durationMinutes: test.durationMinutes,
      questionCount: Math.min(test.questionCount, test.questions.length),
      passPercent: test.passPercent,
    },
    attempt: attempt && toView(attempt, false),
  };
}

export async function startAttempt(userId: string, applicationId: string) {
  const application = await loadOwnedApplication(userId, applicationId);
  const test = application.jobPosting.mcqTest;
  if (!test?.published) throw notFound("This job has no assessment to take");

  const resume = async (attemptId: string) => {
    const existing = await loadOwnedAttempt(userId, attemptId);
    if (existing.submittedAt) throw conflict("You've already taken this assessment");
    return toView(existing, true);
  };

  if (application.mcqAttempt) return resume(application.mcqAttempt.id);
  if (test.questions.length === 0) throw conflict("This assessment has no questions yet");

  const startedAt = new Date();
  const chosen = shuffle(test.questions).slice(0, test.questionCount);
  try {
    const created = await prisma.mcqAttempt.create({
      data: {
        testId: test.id,
        applicationId,
        startedAt,
        expiresAt: new Date(startedAt.getTime() + test.durationMinutes * 60_000),
        questions: {
          create: chosen.map((question, orderIndex) => ({
            questionId: question.id,
            orderIndex,
            optionOrder: shuffle(question.options.map((_, index) => index)),
          })),
        },
      },
      select: { id: true },
    });
    return toView(await loadOwnedAttempt(userId, created.id), true);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await prisma.mcqAttempt.findUniqueOrThrow({ where: { applicationId }, select: { id: true } });
    return resume(raced.id);
  }
}

export async function getAttempt(userId: string, attemptId: string) {
  return toView(await loadOwnedAttempt(userId, attemptId), true);
}

export async function saveAnswer(userId: string, attemptId: string, questionId: string, positions: number[]) {
  const attempt = await loadOwnedAttempt(userId, attemptId);
  if (attempt.submittedAt) throw conflict("This assessment has already been submitted");

  const row = attempt.questions.find((candidate) => candidate.questionId === questionId);
  if (!row) throw notFound("Question not found in this assessment");

  const allowed = row.question.correct.length > 1 ? row.optionOrder.length : 1;
  const valid =
    positions.length <= allowed &&
    new Set(positions).size === positions.length &&
    positions.every((position) => position >= 0 && position < row.optionOrder.length);
  if (!valid) throw badRequest("That isn't a valid selection for this question");

  await prisma.mcqAttemptQuestion.update({
    where: { id: row.id },
    data: {
      selected: positions.map((position) => row.optionOrder[position] as number),
      answeredAt: positions.length > 0 ? new Date() : null,
    },
  });
}

export async function submitAttempt(userId: string, attemptId: string) {
  const attempt = await loadOwnedAttempt(userId, attemptId);
  if (!attempt.submittedAt) await finalizeAttempt(attemptId);
  return toView(await loadOwnedAttempt(userId, attemptId), false);
}

export async function logAttemptEvent(userId: string, attemptId: string, eventType: $Enums.McqEventType) {
  const attempt = await loadOwnedAttempt(userId, attemptId);
  if (attempt.submittedAt) return;
  if ((await prisma.mcqEvent.count({ where: { attemptId } })) >= MAX_EVENTS_PER_ATTEMPT) return;
  await prisma.mcqEvent.create({ data: { attemptId, eventType } });
}
