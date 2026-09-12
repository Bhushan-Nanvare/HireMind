import fs from "fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/shared/embeddings", async () => (await import("./helpers/aiMock")).embeddingsMock());
vi.mock("../src/shared/email", async () => (await import("./helpers/emailMock")).emailMock());

import { api, auth } from "./helpers/app";
import { prisma, resetDatabase } from "./helpers/db";
import { createJob, createUser, makePdf, seedApplication, seedResume } from "./helpers/factories";

const PDF = makePdf(["Casey Candidate", "Node.js developer with PostgreSQL experience"]);
// Files the upload tests write to backend/uploads, cleaned up at the end
const writtenFiles: string[] = [];

beforeEach(resetDatabase);

afterAll(async () => {
  for (const file of writtenFiles) await fs.promises.rm(file, { force: true });
});

async function upload(token: string, bytes: Buffer, fileName: string, contentType: string) {
  const res = await api.post("/api/resumes/upload").set(auth(token)).attach("resume", bytes, { filename: fileName, contentType });
  const stored = await prisma.resume.findFirst({ orderBy: { createdAt: "desc" } });
  if (stored) writtenFiles.push(stored.fileUrl);
  return res;
}

describe("uploading a resume", () => {
  it("reads the text, keeps the file name and stores an embedding", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    const res = await upload(candidate.token, PDF, "Casey CV.pdf", "application/pdf");

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ fileName: "Casey CV.pdf", applicationCount: 0 });
    expect(res.body.data.preview).toContain("Casey Candidate");

    const stored = await prisma.resume.findFirstOrThrow();
    expect(stored.embedding.length).toBeGreaterThan(0);
    expect(stored.parsedText).toContain("PostgreSQL");
  });

  it("rejects a file that isn't a PDF", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    const res = await upload(candidate.token, Buffer.from("just text"), "notes.txt", "text/plain");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only pdf/i);
  });

  it("rejects a file that only claims to be a PDF", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    const res = await upload(candidate.token, Buffer.from("MZ not a pdf at all"), "fake.pdf", "application/pdf");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't a valid pdf/i);
    expect(await prisma.resume.count()).toBe(0);
  });

  it("rejects a PDF with no readable text", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    const res = await upload(candidate.token, makePdf([]), "scan.pdf", "application/pdf");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no text could be read/i);
  });
});

describe("listing and opening resumes", () => {
  it("shows file name, date, preview and usage, but no embedding or full text", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const resume = await seedResume(candidate, { fileName: "Old CV.pdf" });
    const job = await createJob(recruiter);
    await seedApplication(candidate, job.id, resume.id);

    const res = await api.get("/api/resumes/mine").set(auth(candidate.token));
    const listed = res.body.data[0];

    expect(res.status).toBe(200);
    expect(Object.keys(listed).sort()).toEqual(["applicationCount", "createdAt", "fileName", "id", "preview"]);
    expect(listed).toMatchObject({ fileName: "Old CV.pdf", applicationCount: 1 });
  });

  it("streams the PDF back with its original name", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    await upload(candidate.token, PDF, "Casey CV.pdf", "application/pdf");
    const resume = await prisma.resume.findFirstOrThrow();

    const res = await api.get(`/api/resumes/${resume.id}/file`).set(auth(candidate.token));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain('filename="Casey CV.pdf"');
    expect(Buffer.from(res.body).equals(PDF)).toBe(true);
  });

  it("returns 404 for another candidate's resume", async () => {
    const owner = await createUser("CANDIDATE", "Casey");
    const other = await createUser("CANDIDATE", "Olly");
    const resume = await seedResume(owner);

    const res = await api.get(`/api/resumes/${resume.id}/file`).set(auth(other.token));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the stored file has gone", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    const resume = await seedResume(candidate, { fileUrl: "uploads/resumes/missing-file" });

    const res = await api.get(`/api/resumes/${resume.id}/file`).set(auth(candidate.token));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no longer available/i);
  });
});

describe("deleting a resume", () => {
  it("deletes an unused resume and its file", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    await upload(candidate.token, PDF, "Casey CV.pdf", "application/pdf");
    const resume = await prisma.resume.findFirstOrThrow();

    const res = await api.delete(`/api/resumes/${resume.id}`).set(auth(candidate.token));

    expect(res.status).toBe(200);
    expect(await prisma.resume.findUnique({ where: { id: resume.id } })).toBeNull();
    expect(fs.existsSync(resume.fileUrl)).toBe(false);
  });

  it("keeps a resume that was used to apply", async () => {
    const candidate = await createUser("CANDIDATE", "Casey");
    const recruiter = await createUser("RECRUITER", "Acme Corp");
    const resume = await seedResume(candidate);
    const job = await createJob(recruiter);
    await seedApplication(candidate, job.id, resume.id);

    const res = await api.delete(`/api/resumes/${resume.id}`).set(auth(candidate.token));

    expect(res.status).toBe(409);
    expect(await prisma.resume.findUnique({ where: { id: resume.id } })).not.toBeNull();
  });
});
