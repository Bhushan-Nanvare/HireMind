import { prisma } from "../../shared/prisma";
import { generateEmbedding } from "../../shared/embeddings";
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
