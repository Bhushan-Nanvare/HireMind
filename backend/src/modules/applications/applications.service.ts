import { prisma } from "../../shared/prisma";
import { generateEmbedding, cosineSimilarity, generateSkillGaps } from "../../shared/embeddings";

export async function applyToJob(userId: string, jobId: string, resumeId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { userId } });
  if (!candidate) throw new Error("Candidate profile not found");

  const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
  if (!resume || resume.candidateId !== candidate.id) {
    throw new Error("Resume not found or doesn't belong to you");
  }

  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found");

  const existing = await prisma.application.findUnique({
    where: { candidateId_jobId: { candidateId: candidate.id, jobId } },
  });
  if (existing) throw new Error("You've already applied to this job");

  const matchScore = Math.round(
    cosineSimilarity(resume.embedding as number[], job.embedding as number[]) * 100
  );

  const application = await prisma.application.create({
    data: { candidateId: candidate.id, jobId, resumeId, matchScore },
  });

  const gaps = await generateSkillGaps(resume.parsedText || "", job.description);

  if (gaps.length > 0) {
    await prisma.skillGap.createMany({
      data: gaps.map((g) => ({
        applicationId: application.id,
        missingSkill: g.skill,
        importance: g.importance,
      })),
    });
  }

  return { ...application, skillGaps: gaps.map((g) => ({ missingSkill: g.skill, importance: g.importance })) };
}

export async function listMyApplications(userId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { userId } });
  if (!candidate) throw new Error("Candidate profile not found");

  return prisma.application.findMany({
    where: { candidateId: candidate.id },
    include: {
      jobPosting: true,
      skillGaps: true,
      interviewSession: { include: { report: true } },
    },
  });
}

export async function listApplicantsForJob(userId: string, jobId: string) {
  const recruiter = await prisma.recruiter.findUnique({ where: { userId } });
  if (!recruiter) throw new Error("Recruiter profile not found");

  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job || job.recruiterId !== recruiter.id) {
    throw new Error("Job not found or doesn't belong to you");
  }

  return prisma.application.findMany({
    where: { jobId },
    include: {
      candidate: true,
      resume: true,
      skillGaps: true,
      interviewSession: { include: { proctoringEvents: true, report: true } },
    },
  });
}

export async function updateApplicationStatus(userId: string, applicationId: string, status: "SHORTLISTED" | "REJECTED") {
  const recruiter = await prisma.recruiter.findUnique({ where: { userId } });
  if (!recruiter) throw new Error("Recruiter profile not found");

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { jobPosting: true },
  });
  if (!application || application.jobPosting.recruiterId !== recruiter.id) {
    throw new Error("Application not found or doesn't belong to your job posting");
  }

  return prisma.application.update({ where: { id: applicationId }, data: { status } });
}