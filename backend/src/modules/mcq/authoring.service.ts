import { prisma } from "../../shared/prisma";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { finalizeAttempt, finalizeExpired } from "./attempt.service";
import { percentOf, sameSet } from "./grading";
import { parseQuestionCsv, type QuestionInput } from "./import";

export interface TestSettings {
  title: string;
  durationMinutes: number;
  questionCount: number;
  passPercent: number;
  showResult: boolean;
  published: boolean;
}

const MAX_POOL = 500;

async function getRecruiterId(userId: string) {
  const recruiter = await prisma.recruiter.findUnique({ where: { userId }, select: { id: true } });
  if (!recruiter) throw notFound("Recruiter profile not found");
  return recruiter.id;
}

async function getOwnedJob(userId: string, jobId: string) {
  const recruiterId = await getRecruiterId(userId);
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: { recruiterId: true, mcqTest: true } });
  if (!job || job.recruiterId !== recruiterId) throw notFound("Job not found or doesn't belong to you");
  return job;
}

async function getOwnedQuestion(userId: string, questionId: string) {
  const recruiterId = await getRecruiterId(userId);
  const question = await prisma.mcqQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      test: {
        select: {
          id: true,
          published: true,
          questionCount: true,
          job: { select: { recruiterId: true } },
          _count: { select: { attempts: true, questions: true } },
        },
      },
    },
  });
  if (!question || question.test.job.recruiterId !== recruiterId) {
    throw notFound("Question not found or doesn't belong to you");
  }
  return question;
}

export async function getTestForRecruiter(userId: string, jobId: string) {
  const { mcqTest: test } = await getOwnedJob(userId, jobId);
  if (!test) return { test: null, questions: [] };

  await finalizeExpired(test.id);
  const [questions, served, attemptCount] = await Promise.all([
    prisma.mcqQuestion.findMany({ where: { testId: test.id }, orderBy: { position: "asc" } }),
    prisma.mcqAttemptQuestion.findMany({
      where: { attempt: { testId: test.id, submittedAt: { not: null } } },
      select: { questionId: true, selected: true },
    }),
    prisma.mcqAttempt.count({ where: { testId: test.id } }),
  ]);

  const correctById = new Map(questions.map((question) => [question.id, question.correct]));
  const stats = new Map<string, { shown: number; correct: number }>();
  for (const row of served) {
    const entry = stats.get(row.questionId) ?? { shown: 0, correct: 0 };
    entry.shown += 1;
    if (sameSet(row.selected, correctById.get(row.questionId) ?? [])) entry.correct += 1;
    stats.set(row.questionId, entry);
  }

  return {
    test: {
      title: test.title,
      durationMinutes: test.durationMinutes,
      questionCount: test.questionCount,
      passPercent: test.passPercent,
      showResult: test.showResult,
      published: test.published,
      attemptCount,
    },
    questions: questions.map((question) => ({
      id: question.id,
      text: question.text,
      options: question.options,
      correct: question.correct,
      topic: question.topic,
      shown: stats.get(question.id)?.shown ?? 0,
      correctCount: stats.get(question.id)?.correct ?? 0,
    })),
  };
}

export async function saveTest(userId: string, jobId: string, settings: TestSettings) {
  const { mcqTest: existing } = await getOwnedJob(userId, jobId);

  if (settings.published) {
    const pool = existing ? await prisma.mcqQuestion.count({ where: { testId: existing.id } }) : 0;
    if (pool < settings.questionCount) {
      throw conflict(`Add at least ${settings.questionCount} questions before publishing (there are ${pool}).`);
    }
  }
  await prisma.mcqTest.upsert({ where: { jobId }, create: { jobId, ...settings }, update: settings });
}

export async function addQuestions(userId: string, jobId: string, inputs: QuestionInput[]) {
  const { mcqTest: test } = await getOwnedJob(userId, jobId);
  if (!test) throw conflict("Save the assessment settings before adding questions");

  const existing = await prisma.mcqQuestion.aggregate({
    where: { testId: test.id },
    _count: true,
    _max: { position: true },
  });
  if (existing._count + inputs.length > MAX_POOL) {
    throw badRequest(`An assessment can hold at most ${MAX_POOL} questions`);
  }

  const first = (existing._max.position ?? -1) + 1;
  await prisma.mcqQuestion.createMany({
    data: inputs.map((input, index) => ({
      testId: test.id,
      text: input.text,
      options: input.options,
      correct: input.correct,
      topic: input.topic ?? null,
      position: first + index,
    })),
  });
  return { added: inputs.length };
}

export async function importQuestions(userId: string, jobId: string, csv: string) {
  const { questions, errors } = parseQuestionCsv(csv);
  if (errors.length > 0) throw badRequest(`Nothing was imported.\n${errors.join("\n")}`);
  return addQuestions(userId, jobId, questions);
}

function assertEditable(question: Awaited<ReturnType<typeof getOwnedQuestion>>) {
  if (question.test._count.attempts > 0) {
    throw conflict("Candidates have already taken this assessment, so its questions can no longer be changed");
  }
}

export async function updateQuestion(userId: string, questionId: string, input: QuestionInput) {
  const question = await getOwnedQuestion(userId, questionId);
  assertEditable(question);
  await prisma.mcqQuestion.update({
    where: { id: questionId },
    data: { text: input.text, options: input.options, correct: input.correct, topic: input.topic ?? null },
  });
}

export async function deleteQuestion(userId: string, questionId: string) {
  const question = await getOwnedQuestion(userId, questionId);
  assertEditable(question);
  if (question.test.published && question.test._count.questions - 1 < question.test.questionCount) {
    throw conflict(`This assessment needs at least ${question.test.questionCount} questions while it is published`);
  }
  await prisma.mcqQuestion.delete({ where: { id: questionId } });
}

/** One candidate's assessment as the recruiter reviews it: score, per-question breakdown and signals. */
export async function getAssessmentResult(userId: string, applicationId: string) {
  const recruiterId = await getRecruiterId(userId);
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      jobPosting: {
        select: {
          recruiterId: true,
          mcqTest: { select: { title: true, passPercent: true, showResult: true } },
        },
      },
      mcqAttempt: { select: { id: true, submittedAt: true, expiresAt: true } },
    },
  });
  if (!application || application.jobPosting.recruiterId !== recruiterId) {
    throw notFound("Application not found or doesn't belong to you");
  }

  const test = application.jobPosting.mcqTest;
  const started = application.mcqAttempt;
  if (!test || !started) return { test, attempt: null };

  if (!started.submittedAt && started.expiresAt <= new Date()) await finalizeAttempt(started.id);
  const attempt = await prisma.mcqAttempt.findUniqueOrThrow({
    where: { id: started.id },
    include: {
      questions: { orderBy: { orderIndex: "asc" }, include: { question: true } },
      events: { orderBy: { createdAt: "asc" }, select: { eventType: true, metadata: true, createdAt: true } },
    },
  });

  const submitted = attempt.submittedAt !== null && attempt.score !== null && attempt.total !== null;
  const rows = submitted
    ? attempt.questions.map((row) => ({
        number: row.orderIndex + 1,
        text: row.question.text,
        topic: row.question.topic,
        options: row.question.options,
        correct: row.question.correct,
        selected: row.selected,
        isCorrect: sameSet(row.selected, row.question.correct),
      }))
    : [];

  const byTopic = new Map<string, { correct: number; total: number }>();
  for (const row of rows) {
    const key = row.topic ?? "General";
    const entry = byTopic.get(key) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (row.isCorrect) entry.correct += 1;
    byTopic.set(key, entry);
  }

  const percent = submitted ? percentOf(attempt.score as number, attempt.total as number) : null;
  return {
    test,
    attempt: {
      status: submitted ? ("SUBMITTED" as const) : ("IN_PROGRESS" as const),
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      durationSeconds: attempt.submittedAt
        ? Math.round((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000)
        : null,
      score: attempt.score,
      total: attempt.total,
      percent,
      passed: percent === null ? null : percent >= test.passPercent,
      topics: [...byTopic.entries()].map(([topic, value]) => ({ topic, ...value })),
      questions: rows,
      events: attempt.events,
    },
  };
}
