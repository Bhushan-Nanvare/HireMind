import { randomUUID } from "crypto";
import { api, auth } from "./app";
import { prisma } from "./db";

export const PASSWORD = "test-password-123";

const EMBEDDING_SIZE = 16;
const fakeStoredEmbedding = () => Array.from({ length: EMBEDDING_SIZE }, (_, i) => Math.sin(i + 1));

export interface TestUser {
  userId: string;
  email: string;
  token: string;
  /** Candidate or Recruiter profile id */
  profileId: string;
}

/**
 * Signs a user up through the API. Emails are marked verified by default, since most tests aren't about
 * verification; pass `{ verified: false }` to test what unverified accounts can do.
 */
export async function createUser(
  role: "CANDIDATE" | "RECRUITER",
  name: string,
  options: { verified?: boolean } = {}
): Promise<TestUser> {
  const email = `${role.toLowerCase()}-${randomUUID()}@test.local`;
  const res = await api.post("/api/auth/signup").send({ email, password: PASSWORD, role, name });
  if (res.status !== 201) throw new Error(`Sign-up failed: ${res.status} ${res.body?.error}`);

  const user = await prisma.user.update({
    where: { email },
    data: options.verified === false ? {} : { emailVerifiedAt: new Date() },
    include: { candidate: true, recruiter: true },
  });
  const profileId = role === "CANDIDATE" ? user.candidate?.id : user.recruiter?.id;

  return { userId: user.id, email, token: res.body.data.token, profileId: profileId! };
}

/** Posts a job through the API, as the recruiter would. */
export async function createJob(
  recruiter: TestUser,
  overrides: { title?: string; description?: string } = {}
): Promise<{ id: string; title: string; status: string }> {
  const res = await api
    .post("/api/jobs")
    .set(auth(recruiter.token))
    .send({
      title: overrides.title ?? "Senior Backend Engineer",
      description: overrides.description ?? "Node.js, TypeScript and PostgreSQL. Kubernetes and GraphQL a plus.",
    });
  if (res.status !== 201) throw new Error(`Creating the job failed: ${res.status} ${res.body?.error}`);
  return res.body.data;
}

/** A resume as if it had been uploaded and embedded earlier. */
export async function seedResume(candidate: TestUser, overrides: { fileName?: string; fileUrl?: string } = {}) {
  return prisma.resume.create({
    data: {
      candidateId: candidate.profileId,
      fileUrl: overrides.fileUrl ?? `uploads/resumes/${randomUUID()}`,
      fileName: overrides.fileName ?? "Test CV.pdf",
      parsedText: "Backend developer with Node.js, TypeScript, PostgreSQL and Redis experience.",
      embedding: fakeStoredEmbedding(),
    },
  });
}

/** An application as if the candidate had already applied. */
export async function seedApplication(candidate: TestUser, jobId: string, resumeId: string) {
  return prisma.application.create({
    data: {
      candidateId: candidate.profileId,
      jobId,
      resumeId,
      matchScore: 72,
      skillGaps: { create: [{ missingSkill: "Kubernetes", importance: "high" }] },
    },
  });
}

/** A minimal single-page PDF with real text in it, for upload tests. */
export function makePdf(lines: string[]): Buffer {
  const content = ["BT", "/F1 11 Tf", "14 TL", "50 780 Td", ...lines.map((line) => `(${line}) Tj T*`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
