import { prisma } from "../../shared/prisma";
import { cosineSimilarity, generateEmbedding } from "../../shared/embeddings";
import { toMatchPercent } from "../../shared/matching";
import { conflict, notFound } from "../../shared/errors";
import { logger } from "../../shared/logger";

// What anyone browsing jobs sees. Embeddings stay server-side (thousands of numbers each).
const publicJobSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
  recruiter: { select: { companyName: true } },
} as const;

// What a recruiter sees for their own jobs
const ownJobSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
  _count: { select: { applications: true } },
} as const;

function withApplicantCount<T extends { _count: { applications: number } }>({ _count, ...job }: T) {
  return { ...job, applicantCount: _count.applications };
}

/** The text a job's embedding is generated from. Applications use it to backfill a missing embedding. */
export function jobEmbeddingText(job: { title: string; description: string }): string {
  return `${job.title}\n\n${job.description}`;
}

/** An embedding for the job's text, or [] if Gemini is unavailable (the next application generates it instead). */
async function embeddingOrEmpty(title: string, description: string): Promise<number[]> {
  try {
    return await generateEmbedding(jobEmbeddingText({ title, description }));
  } catch (err) {
    logger.warn("Job embedding deferred to the next application", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function getRecruiterId(userId: string) {
  const recruiter = await prisma.recruiter.findUnique({ where: { userId }, select: { id: true } });
  if (!recruiter) throw notFound("Recruiter profile not found");
  return recruiter.id;
}

async function getOwnedJob(userId: string, jobId: string) {
  const recruiterId = await getRecruiterId(userId);
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobId },
    select: { recruiterId: true, title: true, description: true, _count: { select: { applications: true } } },
  });
  if (!job || job.recruiterId !== recruiterId) throw notFound("Job not found or doesn't belong to you");
  return job;
}

export async function createJob(userId: string, title: string, description: string) {
  const recruiterId = await getRecruiterId(userId);
  // A Gemini outage shouldn't block posting a job: the first application generates the missing embedding
  const embedding = await embeddingOrEmpty(title, description);
  const job = await prisma.jobPosting.create({
    data: { recruiterId, title, description, embedding },
    select: ownJobSelect,
  });
  return withApplicantCount(job);
}

export async function listMyJobs(userId: string) {
  const recruiterId = await getRecruiterId(userId);
  const jobs = await prisma.jobPosting.findMany({
    where: { recruiterId },
    select: ownJobSelect,
    orderBy: { createdAt: "desc" },
  });
  return jobs.map(withApplicantCount);
}

export async function updateJob(userId: string, jobId: string, title: string, description: string) {
  const current = await getOwnedJob(userId, jobId);
  // Re-embed only when the text changed. Existing applicants keep the match score they applied with.
  const textChanged = current.title !== title || current.description !== description;
  const embedding = textChanged ? await embeddingOrEmpty(title, description) : undefined;

  const job = await prisma.jobPosting.update({
    where: { id: jobId },
    data: { title, description, ...(embedding ? { embedding } : {}) },
    select: ownJobSelect,
  });
  return withApplicantCount(job);
}

export async function setJobStatus(userId: string, jobId: string, status: "OPEN" | "CLOSED") {
  await getOwnedJob(userId, jobId);
  const job = await prisma.jobPosting.update({ where: { id: jobId }, data: { status }, select: ownJobSelect });
  return withApplicantCount(job);
}

export async function deleteJob(userId: string, jobId: string) {
  const job = await getOwnedJob(userId, jobId);
  if (job._count.applications > 0) {
    throw conflict("This job has applicants, so it can't be deleted. Close it instead to stop new applications.");
  }
  await prisma.jobPosting.delete({ where: { id: jobId } });
}

export async function listAllOpenJobs() {
  return prisma.jobPosting.findMany({
    where: { status: "OPEN" },
    select: publicJobSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function getJobById(jobId: string) {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: publicJobSelect });
  if (!job) throw notFound("Job not found");
  return job;
}

const POOL_RESULTS = 20;
/** Chunks pulled from the index before grouping by candidate; enough to fill POOL_RESULTS. */
const CHUNK_CANDIDATES = 200;

interface PoolRow {
  candidateId: string;
  fullName: string;
  evidence: string | null;
  score: number;
}

/**
 * Ranks every candidate who has uploaded a resume against this job, with the resume section that
 * matched. Contact details are deliberately withheld unless the candidate applied: a resume uploaded
 * to apply for one job isn't consent to be contacted about every other.
 *
 * The chunk search runs in Postgres against an HNSW index rather than in Node, because that table
 * grows by roughly forty rows per resume. Whole-resume vectors stay as plain arrays: comparing one
 * pair of them is O(1), so an index would buy nothing.
 */
export async function searchCandidatePool(userId: string, jobId: string) {
  const recruiterId = await getRecruiterId(userId);
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobId },
    select: { recruiterId: true, title: true, description: true, embedding: true },
  });
  if (!job || job.recruiterId !== recruiterId) throw notFound("Job not found or doesn't belong to you");

  let jobEmbedding = job.embedding;
  if (jobEmbedding.length === 0) {
    jobEmbedding = await generateEmbedding(jobEmbeddingText(job));
    await prisma.jobPosting.update({ where: { id: jobId }, data: { embedding: jobEmbedding } });
  }
  const queryVector = JSON.stringify(jobEmbedding);

  // Nearest chunks first so the index is used, then the best one per candidate
  const rows = await prisma.$queryRaw<PoolRow[]>`
    SELECT c."id" AS "candidateId",
           c."fullName",
           ch."text" AS evidence,
           1 - (ch."embedding" <=> ${queryVector}::vector) AS score
    FROM "ResumeChunk" ch
    JOIN "Resume" r ON r."id" = ch."resumeId"
    JOIN "Candidate" c ON c."id" = r."candidateId"
    WHERE ch."embedding" IS NOT NULL
    ORDER BY ch."embedding" <=> ${queryVector}::vector
    LIMIT ${CHUNK_CANDIDATES}
  `;

  const best = new Map<string, PoolRow>();
  for (const row of rows) {
    const existing = best.get(row.candidateId);
    if (!existing || row.score > existing.score) best.set(row.candidateId, row);
  }

  // Resumes uploaded before chunking existed still rank, just without an evidence quote
  const unchunked = await prisma.resume.findMany({
    where: { chunks: { none: {} } },
    select: { embedding: true, candidate: { select: { id: true, fullName: true } } },
  });
  for (const resume of unchunked) {
    if (resume.embedding.length !== jobEmbedding.length) continue;
    const score = cosineSimilarity(jobEmbedding, resume.embedding);
    const existing = best.get(resume.candidate.id);
    if (existing && existing.score >= score) continue;
    best.set(resume.candidate.id, {
      candidateId: resume.candidate.id,
      fullName: resume.candidate.fullName,
      evidence: null,
      score,
    });
  }

  const ranked = [...best.values()].sort((a, b) => b.score - a.score).slice(0, POOL_RESULTS);
  const applications = await prisma.application.findMany({
    where: { jobId, candidateId: { in: ranked.map((row) => row.candidateId) } },
    select: { id: true, candidateId: true },
  });
  const applied = new Map(applications.map((application) => [application.candidateId, application.id]));

  return ranked.map((row) => ({
    candidateId: row.candidateId,
    fullName: row.fullName,
    matchScore: toMatchPercent(row.score),
    evidence: row.evidence,
    applicationId: applied.get(row.candidateId) ?? null,
  }));
}
