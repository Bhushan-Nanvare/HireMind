import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/shared/embeddings", async () => (await import("./helpers/aiMock")).embeddingsMock());
vi.mock("../src/shared/email", async () => (await import("./helpers/emailMock")).emailMock());

import { api, auth } from "./helpers/app";
import { prisma, resetDatabase } from "./helpers/db";
import { createJob, createUser, seedApplication, seedResume } from "./helpers/factories";

beforeEach(resetDatabase);

describe("posting jobs", () => {
  it("stores an embedding and starts with no applicants", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const res = await api
      .post("/api/jobs")
      .set(auth(recruiter.token))
      .send({ title: "Backend Engineer", description: "Node.js and PostgreSQL" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: "Backend Engineer", status: "OPEN", applicantCount: 0 });
    const stored = await prisma.jobPosting.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(stored.embedding.length).toBeGreaterThan(0);
  });

  it("requires a verified email", async () => {
    const recruiter = await createUser("RECRUITER", "Unverified Corp", { verified: false });
    const res = await api.post("/api/jobs").set(auth(recruiter.token)).send({ title: "Role", description: "Details" });

    expect(res.status).toBe(403);
  });

  it("isn't open to candidates", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    const res = await api.post("/api/jobs").set(auth(candidate.token)).send({ title: "Role", description: "Details" });

    expect(res.status).toBe(403);
  });

  it("validates the input", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const res = await api.post("/api/jobs").set(auth(recruiter.token)).send({ title: "", description: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });
});

describe("browsing jobs", () => {
  it("lists only open jobs, newest first, without embeddings", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const older = await createJob(recruiter, { title: "Older role" });
    const newer = await createJob(recruiter, { title: "Newer role" });
    const closed = await createJob(recruiter, { title: "Closed role" });
    await api.patch(`/api/jobs/${closed.id}/status`).set(auth(recruiter.token)).send({ status: "CLOSED" });

    const res = await api.get("/api/jobs");
    const ids = res.body.data.map((job: { id: string }) => job.id);

    expect(res.status).toBe(200);
    expect(ids).toEqual([newer.id, older.id]);
    expect(res.body.data[0]).toHaveProperty("recruiter.companyName", "Acme Corp");
    expect(JSON.stringify(res.body.data)).not.toContain("embedding");
  });

  it("still shows the details of a closed job", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const job = await createJob(recruiter);
    await api.patch(`/api/jobs/${job.id}/status`).set(auth(recruiter.token)).send({ status: "CLOSED" });

    const res = await api.get(`/api/jobs/${job.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CLOSED");
  });

  it("returns 404 for a job that doesn't exist", async () => {
    const res = await api.get("/api/jobs/00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
  });
});

describe("managing your own jobs", () => {
  it("edits the text and re-embeds it", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const job = await createJob(recruiter);
    const before = await prisma.jobPosting.findUniqueOrThrow({ where: { id: job.id } });

    const res = await api
      .patch(`/api/jobs/${job.id}`)
      .set(auth(recruiter.token))
      .send({ title: "Staff Backend Engineer", description: "Now with Kubernetes and Go" });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Staff Backend Engineer");
    const after = await prisma.jobPosting.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.embedding).not.toEqual(before.embedding);
  });

  it("closes and reopens a job", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const job = await createJob(recruiter);

    const closed = await api.patch(`/api/jobs/${job.id}/status`).set(auth(recruiter.token)).send({ status: "CLOSED" });
    expect(closed.body.data.status).toBe("CLOSED");

    const reopened = await api.patch(`/api/jobs/${job.id}/status`).set(auth(recruiter.token)).send({ status: "OPEN" });
    expect(reopened.body.data.status).toBe("OPEN");
  });

  it("counts applicants", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const job = await createJob(recruiter);
    const resume = await seedResume(candidate);
    await seedApplication(candidate, job.id, resume.id);

    const res = await api.get("/api/jobs/mine").set(auth(recruiter.token));
    expect(res.body.data[0].applicantCount).toBe(1);
  });

  it("deletes a job with no applicants, but not one with applicants", async () => {
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const candidate = await createUser("CANDIDATE", "Casey");
    const empty = await createJob(recruiter, { title: "Empty role" });
    const withApplicant = await createJob(recruiter, { title: "Popular role" });
    const resume = await seedResume(candidate);
    await seedApplication(candidate, withApplicant.id, resume.id);

    expect((await api.delete(`/api/jobs/${empty.id}`).set(auth(recruiter.token))).status).toBe(200);
    expect(await prisma.jobPosting.findUnique({ where: { id: empty.id } })).toBeNull();

    const blocked = await api.delete(`/api/jobs/${withApplicant.id}`).set(auth(recruiter.token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/close it instead/i);
  });

  it("hides other recruiters' jobs behind 404", async () => {
    const owner = await createUser("RECRUITER", "Acme Corp");
    const other = await createUser("RECRUITER", "Other Corp");
    const job = await createJob(owner);

    const edit = await api.patch(`/api/jobs/${job.id}`).set(auth(other.token)).send({ title: "Hijacked", description: "x" });
    const close = await api.patch(`/api/jobs/${job.id}/status`).set(auth(other.token)).send({ status: "CLOSED" });
    const remove = await api.delete(`/api/jobs/${job.id}`).set(auth(other.token));

    expect([edit.status, close.status, remove.status]).toEqual([404, 404, 404]);
    expect((await api.get("/api/jobs/mine").set(auth(other.token))).body.data).toEqual([]);
  });
});
