import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/shared/embeddings", async () => (await import("./helpers/aiMock")).embeddingsMock());
vi.mock("../src/shared/email", async () => (await import("./helpers/emailMock")).emailMock());

import { api, auth } from "./helpers/app";
import { prisma, resetDatabase } from "./helpers/db";
import { createJob, createUser, seedApplication, seedResume, type TestUser } from "./helpers/factories";

beforeEach(resetDatabase);

const settings = {
  title: "Backend screening",
  durationMinutes: 20,
  questionCount: 5,
  passPercent: 60,
  showResult: true,
  published: false,
};

/** Each question's correct option starts with "right", so a test can find it wherever it was shuffled to. */
function bank(size: number) {
  const rows = Array.from({ length: size }, (_, i) => {
    const topic = i % 2 === 0 ? "SQL" : "Node";
    return `Question ${i + 1}?,right ${i + 1},wrong a,wrong b,wrong c,A,${topic}`;
  });
  return ["question,A,B,C,D,correct,topic", ...rows].join("\n");
}

const putSettings = (recruiter: TestUser, jobId: string, overrides: Partial<typeof settings> = {}) =>
  api.put(`/api/mcq/jobs/${jobId}/test`).set(auth(recruiter.token)).send({ ...settings, ...overrides });

const importCsv = (recruiter: TestUser, jobId: string, csv: string) =>
  api.post(`/api/mcq/jobs/${jobId}/questions/import`).set(auth(recruiter.token)).send({ csv });

async function publishedTest(options: { pool?: number; overrides?: Partial<typeof settings> } = {}) {
  const recruiter = await createUser("RECRUITER", "Acme Corp");
  const job = await createJob(recruiter);
  await putSettings(recruiter, job.id, options.overrides);
  await importCsv(recruiter, job.id, bank(options.pool ?? 8));
  await putSettings(recruiter, job.id, { ...options.overrides, published: true });

  const candidate = await createUser("CANDIDATE", "Casey");
  const resume = await seedResume(candidate);
  const application = await seedApplication(candidate, job.id, resume.id);
  return { recruiter, candidate, job, applicationId: application.id };
}

interface PaperQuestion {
  id: string;
  text: string;
  options: string[];
  multiple: boolean;
  selected: number[];
}

const start = (candidate: TestUser, applicationId: string) =>
  api.post(`/api/mcq/applications/${applicationId}/start`).set(auth(candidate.token));

const answer = (candidate: TestUser, attemptId: string, questionId: string, selected: number[]) =>
  api.put(`/api/mcq/attempts/${attemptId}/answers/${questionId}`).set(auth(candidate.token)).send({ selected });

const submit = (candidate: TestUser, attemptId: string) =>
  api.post(`/api/mcq/attempts/${attemptId}/submit`).set(auth(candidate.token));

const positionOf = (question: PaperQuestion, prefix: "right" | "wrong") =>
  question.options.findIndex((option) => option.startsWith(prefix));

async function takeTest(candidate: TestUser, applicationId: string, wrongCount = 0) {
  const paper = (await start(candidate, applicationId)).body.data;
  const questions: PaperQuestion[] = paper.questions;
  for (const [index, question] of questions.entries()) {
    const choice = positionOf(question, index < wrongCount ? "wrong" : "right");
    await answer(candidate, paper.id, question.id, [choice]);
  }
  return { paper, questions };
}

describe("building an assessment", () => {
  it("imports questions from CSV and shows them to the recruiter with their answers", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const job = await createJob(recruiter);
    await putSettings(recruiter, job.id);

    const imported = await importCsv(recruiter, job.id, bank(6));
    const res = await api.get(`/api/mcq/jobs/${job.id}/test`).set(auth(recruiter.token));

    expect(imported.status).toBe(201);
    expect(imported.body.data.added).toBe(6);
    expect(res.body.data.test).toMatchObject({ title: "Backend screening", published: false, attemptCount: 0 });
    expect(res.body.data.questions).toHaveLength(6);
    expect(res.body.data.questions[0]).toMatchObject({ text: "Question 1?", correct: [0], topic: "SQL" });
    expect(res.body.data.questions[5].text).toBe("Question 6?");
  });

  it("rejects a CSV with bad rows, names them, and saves nothing", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const job = await createJob(recruiter);
    await putSettings(recruiter, job.id);

    const csv = "question,A,B,correct\nFine,a,b,A\nWrong letter,a,b,Q\nOne option,a,,A";
    const res = await importCsv(recruiter, job.id, csv);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Row 3");
    expect(res.body.error).toContain("Row 4");
    const after = await api.get(`/api/mcq/jobs/${job.id}/test`).set(auth(recruiter.token));
    expect(after.body.data.questions).toHaveLength(0);
  });

  it("adds a single question from the form", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const job = await createJob(recruiter);
    await putSettings(recruiter, job.id);

    const ok = await api
      .post(`/api/mcq/jobs/${job.id}/questions`)
      .set(auth(recruiter.token))
      .send({ questions: [{ text: "Pick two", options: ["a", "b", "c"], correct: [0, 2], topic: "Misc" }] });
    const bad = await api
      .post(`/api/mcq/jobs/${job.id}/questions`)
      .set(auth(recruiter.token))
      .send({ questions: [{ text: "Out of range", options: ["a", "b"], correct: [5] }] });

    expect(ok.status).toBe(201);
    expect(bad.status).toBe(400);
  });

  it("won't publish with fewer questions than each candidate draws", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const job = await createJob(recruiter);
    await putSettings(recruiter, job.id);
    await importCsv(recruiter, job.id, bank(3));

    const res = await putSettings(recruiter, job.id, { published: true });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/at least 5/);
  });

  it("keeps other recruiters out", async () => {
    const { job } = await publishedTest();
    const other = await createUser("RECRUITER", "Rival Ltd");

    expect((await api.get(`/api/mcq/jobs/${job.id}/test`).set(auth(other.token))).status).toBe(404);
    expect((await putSettings(other, job.id)).status).toBe(404);
    expect((await importCsv(other, job.id, bank(2))).status).toBe(404);
  });

  it("freezes existing questions once a candidate has started, but still allows adding more", async () => {
    const { recruiter, candidate, job, applicationId } = await publishedTest();
    await start(candidate, applicationId);
    const listed = await api.get(`/api/mcq/jobs/${job.id}/test`).set(auth(recruiter.token));
    const questionId: string = listed.body.data.questions[0].id;

    const edit = await api
      .put(`/api/mcq/questions/${questionId}`)
      .set(auth(recruiter.token))
      .send({ text: "Changed", options: ["x", "y"], correct: [0] });
    const remove = await api.delete(`/api/mcq/questions/${questionId}`).set(auth(recruiter.token));
    const add = await importCsv(recruiter, job.id, bank(1));

    expect(edit.status).toBe(409);
    expect(remove.status).toBe(409);
    expect(add.status).toBe(201);
  });

  it("won't shrink a published pool below what each candidate draws", async () => {
    const { recruiter, job } = await publishedTest({ pool: 5 });
    const listed = await api.get(`/api/mcq/jobs/${job.id}/test`).set(auth(recruiter.token));

    const res = await api.delete(`/api/mcq/questions/${listed.body.data.questions[0].id}`).set(auth(recruiter.token));

    expect(res.status).toBe(409);
  });
});

describe("taking an assessment", () => {
  it("draws the configured number of distinct questions and never reveals the answers", async () => {
    const { candidate, applicationId } = await publishedTest({ pool: 8 });

    const res = await start(candidate, applicationId);

    expect(res.status).toBe(200);
    const questions: PaperQuestion[] = res.body.data.questions;
    expect(questions).toHaveLength(5);
    expect(new Set(questions.map((question) => question.id)).size).toBe(5);
    expect(questions.every((question) => question.options.length === 4 && !question.multiple)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("correct");
    expect(res.body.data.secondsLeft).toBeGreaterThan(19 * 60);
  });

  it("scores by the options as they were shown, however they were shuffled", async () => {
    const { candidate, applicationId } = await publishedTest();
    const { paper } = await takeTest(candidate, applicationId, 1);

    const res = await submit(candidate, paper.id);

    expect(res.body.data.status).toBe("SUBMITTED");
    expect(res.body.data.result).toEqual({ score: 4, total: 5, percent: 80, passed: true });
  });

  it("fails a candidate below the pass mark", async () => {
    const { candidate, applicationId } = await publishedTest();
    const { paper } = await takeTest(candidate, applicationId, 3);

    const res = await submit(candidate, paper.id);

    expect(res.body.data.result).toMatchObject({ score: 2, percent: 40, passed: false });
  });

  it("returns the same paper when reopened, with the saved selections", async () => {
    const { candidate, applicationId } = await publishedTest();
    const first = (await start(candidate, applicationId)).body.data;
    const question: PaperQuestion = first.questions[0];
    await answer(candidate, first.id, question.id, [2]);

    const again = (await start(candidate, applicationId)).body.data;
    const reloaded = (await api.get(`/api/mcq/attempts/${first.id}`).set(auth(candidate.token))).body.data;

    expect(again.id).toBe(first.id);
    expect(again.questions.map((q: PaperQuestion) => q.id)).toEqual(first.questions.map((q: PaperQuestion) => q.id));
    expect(again.questions[0].options).toEqual(question.options);
    expect(again.questions[0].selected).toEqual([2]);
    expect(reloaded.questions[0].selected).toEqual([2]);
  });

  it("allows one attempt only", async () => {
    const { candidate, applicationId } = await publishedTest();
    const { paper } = await takeTest(candidate, applicationId);
    await submit(candidate, paper.id);

    expect((await start(candidate, applicationId)).status).toBe(409);
    const overview = await api.get(`/api/mcq/applications/${applicationId}`).set(auth(candidate.token));
    expect(overview.body.data.attempt).toMatchObject({ status: "SUBMITTED", result: { percent: 100, passed: true } });
  });

  it("hides the result from the candidate when the recruiter turns that off, but not from the recruiter", async () => {
    const { recruiter, candidate, applicationId } = await publishedTest({ overrides: { showResult: false } });
    const { paper } = await takeTest(candidate, applicationId);

    const submitted = await submit(candidate, paper.id);
    const review = await api.get(`/api/mcq/applications/${applicationId}/result`).set(auth(recruiter.token));

    expect(submitted.body.data.result).toBeNull();
    expect(review.body.data.attempt).toMatchObject({ score: 5, total: 5, percent: 100, passed: true });
  });

  it("grades an attempt whose time ran out, using the answers saved so far", async () => {
    const { candidate, applicationId } = await publishedTest();
    const { paper, questions } = await takeTest(candidate, applicationId, 3);
    await prisma.mcqAttempt.update({ where: { id: paper.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const reopened = await api.get(`/api/mcq/attempts/${paper.id}`).set(auth(candidate.token));
    const late = await answer(candidate, paper.id, questions[0]!.id, [0]);

    expect(reopened.body.data).toMatchObject({ status: "SUBMITTED", result: { score: 2, total: 5 } });
    expect(late.status).toBe(409);
  });

  it("checks selections: one answer for single-answer questions, and only valid positions", async () => {
    const { candidate, applicationId } = await publishedTest();
    const paper = (await start(candidate, applicationId)).body.data;
    const questionId: string = paper.questions[0].id;

    expect((await answer(candidate, paper.id, questionId, [0, 1])).status).toBe(400);
    expect((await answer(candidate, paper.id, questionId, [9])).status).toBe(400);
    expect((await answer(candidate, paper.id, questionId, [])).status).toBe(200);
  });

  it("marks a select-all question right only when every correct option is chosen", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const job = await createJob(recruiter);
    await putSettings(recruiter, job.id, { questionCount: 1 });
    await importCsv(recruiter, job.id, "question,A,B,C,correct\nPick the right two,right 1,right 2,wrong a,A|B");
    await putSettings(recruiter, job.id, { questionCount: 1, published: true });
    const candidate = await createUser("CANDIDATE", "Casey");
    const application = await seedApplication(candidate, job.id, (await seedResume(candidate)).id);

    const paper = (await start(candidate, application.id)).body.data;
    const question: PaperQuestion = paper.questions[0];
    const rightPositions = question.options.flatMap((option, index) => (option.startsWith("right") ? [index] : []));
    expect(question.multiple).toBe(true);

    await answer(candidate, paper.id, question.id, [rightPositions[0]!]);
    const partial = await submit(candidate, paper.id);

    expect(partial.body.data.result.score).toBe(0);
  });

  it("gives a candidate full marks only for the full set", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const job = await createJob(recruiter);
    await putSettings(recruiter, job.id, { questionCount: 1 });
    await importCsv(recruiter, job.id, "question,A,B,C,correct\nPick the right two,right 1,right 2,wrong a,A|B");
    await putSettings(recruiter, job.id, { questionCount: 1, published: true });
    const candidate = await createUser("CANDIDATE", "Casey");
    const application = await seedApplication(candidate, job.id, (await seedResume(candidate)).id);

    const paper = (await start(candidate, application.id)).body.data;
    const question: PaperQuestion = paper.questions[0];
    const rightPositions = question.options.flatMap((option, index) => (option.startsWith("right") ? [index] : []));
    await answer(candidate, paper.id, question.id, rightPositions);

    expect((await submit(candidate, paper.id)).body.data.result.score).toBe(1);
  });

  it("keeps other candidates out of an attempt", async () => {
    const { candidate, applicationId } = await publishedTest();
    const paper = (await start(candidate, applicationId)).body.data;
    const other = await createUser("CANDIDATE", "Olly");

    expect((await start(other, applicationId)).status).toBe(404);
    expect((await api.get(`/api/mcq/attempts/${paper.id}`).set(auth(other.token))).status).toBe(404);
    expect((await answer(other, paper.id, paper.questions[0].id, [0])).status).toBe(404);
    expect((await submit(other, paper.id)).status).toBe(404);
  });

  it("keeps a finished result viewable after the recruiter unpublishes the assessment", async () => {
    const { recruiter, candidate, job, applicationId } = await publishedTest();
    const { paper } = await takeTest(candidate, applicationId);
    await submit(candidate, paper.id);
    await putSettings(recruiter, job.id, { published: false });

    const overview = await api.get(`/api/mcq/applications/${applicationId}`).set(auth(candidate.token));

    expect(overview.body.data.attempt).toMatchObject({ status: "SUBMITTED", result: { percent: 100 } });
  });

  it("doesn't start an assessment that isn't published", async () => {
    const { recruiter, candidate, job, applicationId } = await publishedTest();
    await putSettings(recruiter, job.id, { published: false });

    expect((await start(candidate, applicationId)).status).toBe(404);
    const overview = await api.get(`/api/mcq/applications/${applicationId}`).set(auth(candidate.token));
    expect(overview.body.data.test).toBeNull();
  });
});

describe("reviewing results", () => {
  it("gives the recruiter a breakdown with topics and signals", async () => {
    const { recruiter, candidate, applicationId } = await publishedTest();
    const { paper } = await takeTest(candidate, applicationId, 1);
    await api.post(`/api/mcq/attempts/${paper.id}/events`).set(auth(candidate.token)).send({ eventType: "TAB_SWITCH" });
    await submit(candidate, paper.id);

    const res = await api.get(`/api/mcq/applications/${applicationId}/result`).set(auth(recruiter.token));
    const attempt = res.body.data.attempt;

    expect(attempt).toMatchObject({ status: "SUBMITTED", score: 4, total: 5, percent: 80, passed: true });
    expect(attempt.questions).toHaveLength(5);
    expect(attempt.questions.filter((q: { isCorrect: boolean }) => !q.isCorrect)).toHaveLength(1);
    expect(attempt.topics.reduce((sum: number, topic: { total: number }) => sum + topic.total, 0)).toBe(5);
    const signals = attempt.events.map((event: { eventType: string }) => event.eventType);
    expect(signals).toContain("TAB_SWITCH");
    expect(signals).toContain("ANSWERED_TOO_FAST");
  });

  it("refuses signals that only the server may record", async () => {
    const { candidate, applicationId } = await publishedTest();
    const paper = (await start(candidate, applicationId)).body.data;

    const res = await api
      .post(`/api/mcq/attempts/${paper.id}/events`)
      .set(auth(candidate.token))
      .send({ eventType: "ANSWERED_TOO_FAST" });

    expect(res.status).toBe(400);
  });

  it("shows the assessment on the applicants list, and keeps other recruiters out of the result", async () => {
    const { recruiter, candidate, job, applicationId } = await publishedTest();
    const before = await api.get(`/api/applications/job/${job.id}`).set(auth(recruiter.token));
    const { paper } = await takeTest(candidate, applicationId);
    await submit(candidate, paper.id);
    const after = await api.get(`/api/applications/job/${job.id}`).set(auth(recruiter.token));
    const other = await createUser("RECRUITER", "Rival Ltd");

    expect(before.body.data.applicants[0].assessment).toEqual({ status: "NOT_STARTED", percent: null, passed: null });
    expect(after.body.data.applicants[0].assessment).toEqual({ status: "SUBMITTED", percent: 100, passed: true });
    expect((await api.get(`/api/mcq/applications/${applicationId}/result`).set(auth(other.token))).status).toBe(404);
  });

  it("tells the recruiter how often each question was answered correctly", async () => {
    const { recruiter, candidate, job, applicationId } = await publishedTest({ pool: 5 });
    const { paper } = await takeTest(candidate, applicationId, 1);
    await submit(candidate, paper.id);

    const res = await api.get(`/api/mcq/jobs/${job.id}/test`).set(auth(recruiter.token));
    const stats = res.body.data.questions as { shown: number; correctCount: number }[];

    expect(stats.every((question) => question.shown === 1)).toBe(true);
    expect(stats.reduce((sum, question) => sum + question.correctCount, 0)).toBe(4);
  });

  it("lets a candidate see that a job has an assessment, and whether they've finished it", async () => {
    const { candidate, applicationId } = await publishedTest();
    const before = await api.get("/api/applications/mine").set(auth(candidate.token));
    const { paper } = await takeTest(candidate, applicationId);
    await submit(candidate, paper.id);
    const after = await api.get("/api/applications/mine").set(auth(candidate.token));

    expect(before.body.data[0].jobPosting.mcqTest.published).toBe(true);
    expect(before.body.data[0].mcqAttempt).toBeNull();
    expect(after.body.data[0].mcqAttempt.submittedAt).not.toBeNull();
  });
});
