import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/shared/embeddings", async () => (await import("./helpers/aiMock")).embeddingsMock());
vi.mock("../src/shared/email", async () => (await import("./helpers/emailMock")).emailMock());

import * as ai from "../src/shared/embeddings";
import { api, auth } from "./helpers/app";
import { prisma, resetDatabase } from "./helpers/db";
import { createJob, createUser, seedApplication, seedResume, type TestUser } from "./helpers/factories";

const LONG_ANSWER = "I built an orders service in Express with PostgreSQL, using transactions for the writes that mattered.";
const SHORT_ANSWER = "Not much.";

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

/** A candidate who has applied to a job, ready to interview. */
async function readyToInterview(): Promise<{ candidate: TestUser; recruiter: TestUser; applicationId: string; jobId: string }> {
  const recruiter = await createUser("RECRUITER", "Acme Corp");
  const candidate = await createUser("CANDIDATE", "Casey");
  const job = await createJob(recruiter);
  const resume = await seedResume(candidate);
  const application = await seedApplication(candidate, job.id, resume.id);
  return { candidate, recruiter, applicationId: application.id, jobId: job.id };
}

const start = (candidate: TestUser, applicationId: string) =>
  api.post("/api/interviews/start").set(auth(candidate.token)).send({ applicationId });

const answer = (candidate: TestUser, sessionId: string, questionId: string, answerText: string, timeTakenSeconds = 90) =>
  api.post(`/api/interviews/${sessionId}/answer`).set(auth(candidate.token)).send({ questionId, answerText, timeTakenSeconds });

describe("starting and resuming", () => {
  it("reports no interview until the candidate starts", async () => {
    const { candidate, applicationId } = await readyToInterview();

    const res = await api.get(`/api/interviews/by-application/${applicationId}`).set(auth(candidate.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ jobTitle: "Senior Backend Engineer", companyName: "Acme Corp", interview: null });
    expect(ai.generateNextQuestion).not.toHaveBeenCalled();
  });

  it("creates the first question, and returns the same one when reopened", async () => {
    const { candidate, applicationId } = await readyToInterview();

    const first = await start(candidate, applicationId);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ done: false, totalQuestions: 5 });
    expect(first.body.data.question.orderIndex).toBe(1);

    const again = await start(candidate, applicationId);
    expect(again.body.data.question.id).toBe(first.body.data.question.id);
    // The second call resumed rather than generating another question
    expect(ai.generateNextQuestion).toHaveBeenCalledTimes(1);
  });

  it("keeps other candidates out", async () => {
    const { applicationId } = await readyToInterview();
    const other = await createUser("CANDIDATE", "Olly");

    expect((await start(other, applicationId)).status).toBe(404);
    expect((await api.get(`/api/interviews/by-application/${applicationId}`).set(auth(other.token))).status).toBe(404);
  });
});

describe("answering", () => {
  it("scores each answer, adapts the difficulty and finishes with a report", async () => {
    const { candidate, applicationId } = await readyToInterview();
    let state = (await start(candidate, applicationId)).body.data;
    const sessionId = state.session.id;

    // A long answer scores 8 in the mock, so the next question should get harder
    const second = await answer(candidate, sessionId, state.question.id, LONG_ANSWER);
    expect(second.body.data.score).toBe(8);
    expect(second.body.data.feedback).toBe("Test feedback.");
    expect(second.body.data.question.orderIndex).toBe(2);
    expect(second.body.data.question.difficulty).toBe("hard");

    // A short answer scores 3, so the one after that should get easier
    state = second.body.data;
    const third = await answer(candidate, sessionId, state.question.id, SHORT_ANSWER);
    expect(third.body.data.question.difficulty).toBe("easy");

    // Work through the rest
    state = third.body.data;
    for (let i = 3; i <= 5; i++) {
      const res = await answer(candidate, sessionId, state.question.id, LONG_ANSWER);
      state = res.body.data;
    }

    expect(state.done).toBe(true);
    expect(state.report).toMatchObject({ summary: "Test summary of the interview.", recommendation: "Recommend — test reason." });
    const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe("COMPLETED");
    expect(session.endedAt).not.toBeNull();
  });

  it("stores the score and feedback with the answer", async () => {
    const { candidate, applicationId } = await readyToInterview();
    const state = (await start(candidate, applicationId)).body.data;
    await answer(candidate, state.session.id, state.question.id, LONG_ANSWER);

    const saved = await prisma.interviewAnswer.findFirstOrThrow();
    expect(saved).toMatchObject({ score: 8, feedback: "Test feedback.", aiLikelihoodScore: 25 });
  });

  it("refuses a second answer to the same question", async () => {
    const { candidate, applicationId } = await readyToInterview();
    const state = (await start(candidate, applicationId)).body.data;
    await answer(candidate, state.session.id, state.question.id, LONG_ANSWER);

    const again = await answer(candidate, state.session.id, state.question.id, LONG_ANSWER);
    expect(again.status).toBe(409);
  });

  it("saves the answer even when the next question can't be generated, and recovers on retry", async () => {
    const { candidate, applicationId } = await readyToInterview();
    const state = (await start(candidate, applicationId)).body.data;
    vi.mocked(ai.generateNextQuestion).mockRejectedValueOnce(new ai.AiServiceError(new Error("quota")));

    const pending = await answer(candidate, state.session.id, state.question.id, LONG_ANSWER);
    expect(pending.status).toBe(200);
    expect(pending.body.data).toMatchObject({ done: false, question: null, score: 8 });
    expect(await prisma.interviewAnswer.count()).toBe(1);

    // What the "Try again" button does
    const recovered = await start(candidate, applicationId);
    expect(recovered.body.data.question.orderIndex).toBe(2);
  });

  it("fails without saving when scoring is unavailable", async () => {
    const { candidate, applicationId } = await readyToInterview();
    const state = (await start(candidate, applicationId)).body.data;
    vi.mocked(ai.evaluateAnswer).mockRejectedValueOnce(new ai.AiServiceError(new Error("quota")));

    const res = await answer(candidate, state.session.id, state.question.id, LONG_ANSWER);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
    expect(await prisma.interviewAnswer.count()).toBe(0);
  });

  it("transcribes a voice answer and keeps the recording for the recruiter", async () => {
    const { candidate, recruiter, applicationId } = await readyToInterview();
    const state = (await start(candidate, applicationId)).body.data;

    const res = await api
      .post(`/api/interviews/${state.session.id}/answer-audio`)
      .set(auth(candidate.token))
      .field("questionId", state.question.id)
      .attach("audio", Buffer.from("fake webm audio"), { filename: "answer.webm", contentType: "audio/webm" });

    expect(res.status).toBe(200);
    const saved = await prisma.interviewAnswer.findFirstOrThrow();
    expect(saved.answerText).toBe("Transcribed text from the candidate's recording.");
    expect(saved.audioMimeType).toBe("audio/webm");
    expect(saved.audioUrl).not.toBeNull();

    const detail = await api.get(`/api/applications/${applicationId}`).set(auth(recruiter.token));
    expect(detail.body.data.interviewSession.questions[0].answer.isVoice).toBe(true);

    const recording = await api
      .get(`/api/applications/${applicationId}/answers/${saved.id}/audio`)
      .set(auth(recruiter.token));
    expect(recording.status).toBe(200);
    expect(recording.headers["content-type"]).toBe("audio/webm");
  });
});

describe("anti-cheat signals", () => {
  it("flags an answer typed impossibly fast", async () => {
    const { candidate, applicationId } = await readyToInterview();
    const state = (await start(candidate, applicationId)).body.data;

    await answer(candidate, state.session.id, state.question.id, LONG_ANSWER, 2);

    const events = await prisma.proctoringEvent.findMany();
    expect(events.map((event) => event.eventType)).toContain("SUSPICIOUS_TYPING_SPEED");
    expect(events[0]!.metadata).toMatchObject({ answerLength: LONG_ANSWER.length });
  });

  it("records the events the browser reports, but not server-side ones", async () => {
    const { candidate, applicationId } = await readyToInterview();
    const state = (await start(candidate, applicationId)).body.data;
    const sessionId = state.session.id;

    const allowed = await api
      .post(`/api/interviews/${sessionId}/proctoring`)
      .set(auth(candidate.token))
      .send({ eventType: "TAB_SWITCH", metadata: { hiddenFor: 4 } });
    const rejected = await api
      .post(`/api/interviews/${sessionId}/proctoring`)
      .set(auth(candidate.token))
      .send({ eventType: "SUSPICIOUS_TYPING_SPEED" });

    expect(allowed.status).toBe(201);
    expect(rejected.status).toBe(400);
    expect(await prisma.proctoringEvent.count()).toBe(1);
  });

  it("keeps them out of the candidate's own transcript", async () => {
    const { candidate, applicationId } = await readyToInterview();
    const state = (await start(candidate, applicationId)).body.data;
    await answer(candidate, state.session.id, state.question.id, LONG_ANSWER);
    await api.post(`/api/interviews/${state.session.id}/proctoring`).set(auth(candidate.token)).send({ eventType: "TAB_SWITCH" });

    const res = await api.get(`/api/interviews/${state.session.id}`).set(auth(candidate.token));
    const body = JSON.stringify(res.body.data);

    expect(res.status).toBe(200);
    expect(res.body.data.questions[0].answer).toMatchObject({ score: 8, feedback: "Test feedback.", isVoice: false });
    expect(body).not.toContain("aiLikelihood");
    expect(body).not.toContain("proctoringEvents");
    expect(body).not.toContain("audioUrl");
  });
});
