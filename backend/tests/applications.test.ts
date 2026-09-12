import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/shared/embeddings", async () => (await import("./helpers/aiMock")).embeddingsMock());
vi.mock("../src/shared/email", async () => (await import("./helpers/emailMock")).emailMock());

import { api, auth } from "./helpers/app";
import { prisma, resetDatabase } from "./helpers/db";
import { clearEmails, lastEmailTo, sentEmails } from "./helpers/emailMock";
import { createJob, createUser, seedApplication, seedResume } from "./helpers/factories";

beforeEach(async () => {
  await resetDatabase();
  clearEmails();
});

describe("applying", () => {
  it("returns a match score and skill gaps", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter);
    const resume = await seedResume(candidate);

    const res = await api.post("/api/applications").set(auth(candidate.token)).send({ jobId: job.id, resumeId: resume.id });

    expect(res.status).toBe(201);
    expect(res.body.data.matchScore).toBeGreaterThanOrEqual(0);
    expect(res.body.data.matchScore).toBeLessThanOrEqual(100);
    expect(res.body.data.status).toBe("APPLIED");
    expect(res.body.data.skillGaps.length).toBeGreaterThan(0);
  });

  it("won't let the same candidate apply twice", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter);
    const resume = await seedResume(candidate);
    await api.post("/api/applications").set(auth(candidate.token)).send({ jobId: job.id, resumeId: resume.id });

    const again = await api.post("/api/applications").set(auth(candidate.token)).send({ jobId: job.id, resumeId: resume.id });

    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already applied/i);
  });

  it("refuses a closed job", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter);
    const resume = await seedResume(candidate);
    await api.patch(`/api/jobs/${job.id}/status`).set(auth(recruiter.token)).send({ status: "CLOSED" });

    const res = await api.post("/api/applications").set(auth(candidate.token)).send({ jobId: job.id, resumeId: resume.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no longer accepting/i);
  });

  it("refuses someone else's resume", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const other = await createUser("CANDIDATE", "Olly");
    const job = await createJob(recruiter);
    const resume = await seedResume(other);

    const res = await api.post("/api/applications").set(auth(candidate.token)).send({ jobId: job.id, resumeId: resume.id });

    expect(res.status).toBe(404);
  });

  it("lists the candidate's own applications with company and interview status", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter);
    const resume = await seedResume(candidate);
    await seedApplication(candidate, job.id, resume.id);

    const res = await api.get("/api/applications/mine").set(auth(candidate.token));

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      status: "APPLIED",
      jobPosting: { title: job.title, status: "OPEN", recruiter: { companyName: "Acme Corp" } },
    });
    expect(JSON.stringify(res.body.data)).not.toContain("embedding");
  });
});

describe("the recruiter's applicant views", () => {
  it("lists applicants with contact email, but no resume text or embeddings", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey Candidate");
    const job = await createJob(recruiter);
    const resume = await seedResume(candidate);
    await seedApplication(candidate, job.id, resume.id);

    const res = await api.get(`/api/applications/job/${job.id}`).set(auth(recruiter.token));

    expect(res.status).toBe(200);
    expect(res.body.data.job).toMatchObject({ id: job.id, title: job.title });
    expect(res.body.data.applicants[0].candidate).toEqual({ fullName: "Casey Candidate", email: candidate.email });
    expect(JSON.stringify(res.body.data)).not.toContain("parsedText");
    expect(JSON.stringify(res.body.data)).not.toContain("embedding");
  });

  it("shows one applicant in detail, without stored file paths", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter);
    const resume = await seedResume(candidate, { fileName: "Casey CV.pdf" });
    const application = await seedApplication(candidate, job.id, resume.id);

    const res = await api.get(`/api/applications/${application.id}`).set(auth(recruiter.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      candidate: { email: candidate.email },
      resume: { fileName: "Casey CV.pdf" },
      job: { id: job.id },
    });
    expect(res.body.data.skillGaps.length).toBe(1);
    expect(JSON.stringify(res.body.data)).not.toContain("fileUrl");
  });

  it("streams the applicant's resume", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter);
    const resume = await seedResume(candidate, { fileUrl: "uploads/resumes/gone" });
    const application = await seedApplication(candidate, job.id, resume.id);

    // The row points at a file that isn't there, which is the "storage reset" case
    const res = await api.get(`/api/applications/${application.id}/resume`).set(auth(recruiter.token));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no longer available/i);
  });

  it("hides another recruiter's applicants behind 404", async () => {
    const owner = await createUser("RECRUITER", "Acme Corp");
    const other = await createUser("RECRUITER", "Other Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(owner);
    const resume = await seedResume(candidate);
    const application = await seedApplication(candidate, job.id, resume.id);

    expect((await api.get(`/api/applications/job/${job.id}`).set(auth(other.token))).status).toBe(404);
    expect((await api.get(`/api/applications/${application.id}`).set(auth(other.token))).status).toBe(404);
    expect((await api.get(`/api/applications/${application.id}/resume`).set(auth(other.token))).status).toBe(404);
  });

  it("isn't open to candidates", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter);

    expect((await api.get(`/api/applications/job/${job.id}`).set(auth(candidate.token))).status).toBe(403);
  });
});

describe("decisions", () => {
  it("emails the candidate when shortlisted or rejected, but not when undone", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter, { title: "Backend Engineer" });
    const resume = await seedResume(candidate);
    const application = await seedApplication(candidate, job.id, resume.id);
    const setStatus = (status: string) =>
      api.patch(`/api/applications/${application.id}/status`).set(auth(recruiter.token)).send({ status });

    clearEmails();
    expect((await setStatus("SHORTLISTED")).body.data.status).toBe("SHORTLISTED");
    expect(lastEmailTo(candidate.email)?.subject).toMatch(/shortlisted for Backend Engineer/i);

    clearEmails();
    expect((await setStatus("APPLIED")).body.data.status).toBe("APPLIED");
    expect(sentEmails).toHaveLength(0);

    clearEmails();
    expect((await setStatus("REJECTED")).body.data.status).toBe("REJECTED");
    expect(lastEmailTo(candidate.email)?.subject).toMatch(/update on your application/i);
  });

  it("validates the status", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter);
    const resume = await seedResume(candidate);
    const application = await seedApplication(candidate, job.id, resume.id);

    const res = await api
      .patch(`/api/applications/${application.id}/status`)
      .set(auth(recruiter.token))
      .send({ status: "HIRED" });

    expect(res.status).toBe(400);
    expect(await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).toMatchObject({
      status: "APPLIED",
    });
  });
});
