import { prisma, isUniqueViolation } from "../../shared/prisma";
import { generateEmbedding, cosineSimilarity, generateSkillGaps } from "../../shared/embeddings";
import { sendEmailInBackground } from "../../shared/email";
import { applicationStatusEmail } from "../../shared/emailTemplates";
import { badRequest, conflict, notFound } from "../../shared/errors";
import { jobEmbeddingText } from "../jobs/jobs.service";

type ApplicationStatus = "APPLIED" | "SHORTLISTED" | "REJECTED";

async function getRecruiterId(userId: string) {
  const recruiter = await prisma.recruiter.findUnique({ where: { userId }, select: { id: true } });
  if (!recruiter) throw notFound("Recruiter profile not found");
  return recruiter.id;
}

const notYourApplication = () => notFound("Application not found or doesn't belong to your job posting");

export async function applyToJob(userId: string, jobId: string, resumeId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { userId } });
  if (!candidate) throw notFound("Candidate profile not found");

  const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
  if (!resume || resume.candidateId !== candidate.id) {
    throw notFound("Resume not found or doesn't belong to you");
  }
  const resumeText = resume.parsedText?.trim();
  if (!resumeText) throw badRequest("No text could be read from this resume. Please upload a text-based PDF.");

  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) throw notFound("Job not found");
  if (job.status !== "OPEN") throw conflict("This job is no longer accepting applications");

  const existing = await prisma.application.findUnique({
    where: { candidateId_jobId: { candidateId: candidate.id, jobId } },
  });
  if (existing) throw conflict("You've already applied to this job");

  const embedResume = (stored: number[] | null) =>
    ensureEmbedding(stored, resumeText, (embedding) =>
      prisma.resume.update({ where: { id: resume.id }, data: { embedding } })
    );
  const embedJob = (stored: number[] | null) =>
    ensureEmbedding(stored, jobEmbeddingText(job), (embedding) =>
      prisma.jobPosting.update({ where: { id: job.id }, data: { embedding } })
    );

  // Do all AI work before writing the application: if Gemini fails, nothing half-finished is left
  // behind and the candidate can simply apply again.
  let [resumeEmbedding, jobEmbedding, gaps] = await Promise.all([
    embedResume(resume.embedding),
    embedJob(job.embedding),
    generateSkillGaps(resumeText, job.description),
  ]);
  if (resumeEmbedding.length !== jobEmbedding.length) {
    // One was stored by an older embedding model with a different size: regenerate both with the current model
    [resumeEmbedding, jobEmbedding] = await Promise.all([embedResume(null), embedJob(null)]);
  }
  const similarity = cosineSimilarity(resumeEmbedding, jobEmbedding);
  const matchScore = Math.round(Math.min(Math.max(similarity, 0), 1) * 100);

  try {
    // Nested create: the application and its skill gaps are written atomically
    return await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId,
        resumeId,
        matchScore,
        skillGaps: { create: gaps.map((g) => ({ missingSkill: g.skill, importance: g.importance })) },
      },
      select: { id: true, matchScore: true, status: true, skillGaps: { select: { missingSkill: true, importance: true } } },
    });
  } catch (err) {
    // Two simultaneous apply requests: the unique (candidateId, jobId) constraint rejects the second
    if (isUniqueViolation(err)) throw conflict("You've already applied to this job");
    throw err;
  }
}

/** Returns the stored embedding, first generating and saving it if it's missing (e.g. jobs posted before embeddings existed). */
async function ensureEmbedding(
  stored: number[] | null,
  text: string,
  save: (embedding: number[]) => Promise<unknown>
): Promise<number[]> {
  if (stored && stored.length > 0) return stored;
  const embedding = await generateEmbedding(text);
  await save(embedding);
  return embedding;
}

export async function listMyApplications(userId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { userId } });
  if (!candidate) throw notFound("Candidate profile not found");

  return prisma.application.findMany({
    where: { candidateId: candidate.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      matchScore: true,
      createdAt: true,
      jobPosting: { select: { id: true, title: true, status: true, recruiter: { select: { companyName: true } } } },
      skillGaps: { select: { missingSkill: true, importance: true } },
      interviewSession: {
        select: { id: true, status: true, report: { select: { summary: true, recommendation: true } } },
      },
    },
  });
}

export async function listApplicantsForJob(userId: string, jobId: string) {
  const recruiterId = await getRecruiterId(userId);
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobId },
    select: { id: true, title: true, status: true, recruiterId: true },
  });
  if (!job || job.recruiterId !== recruiterId) {
    throw notFound("Job not found or doesn't belong to you");
  }

  const applications = await prisma.application.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      matchScore: true,
      status: true,
      createdAt: true,
      candidate: { select: { fullName: true, user: { select: { email: true } } } },
      skillGaps: { select: { missingSkill: true, importance: true } },
      interviewSession: {
        select: {
          status: true,
          report: { select: { summary: true, recommendation: true } },
          proctoringEvents: { select: { eventType: true } },
          questions: { select: { answer: { select: { aiLikelihoodScore: true } } } },
        },
      },
    },
  });

  return {
    job: { id: job.id, title: job.title, status: job.status },
    // Only what the page shows: name and contact email, never resume text, embeddings or internal IDs
    applicants: applications.map(({ candidate, ...application }) => ({
      ...application,
      candidate: { fullName: candidate.fullName, email: candidate.user.email },
    })),
  };
}

/** Everything the recruiter's applicant page shows: contact details, transcript, scores and anti-cheat signals. */
export async function getApplicationForRecruiter(userId: string, applicationId: string) {
  const recruiterId = await getRecruiterId(userId);
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      matchScore: true,
      createdAt: true,
      jobPosting: { select: { id: true, title: true, status: true, recruiterId: true } },
      candidate: { select: { fullName: true, user: { select: { email: true } } } },
      resume: { select: { fileName: true } },
      skillGaps: { select: { missingSkill: true, importance: true } },
      interviewSession: {
        select: {
          status: true,
          startedAt: true,
          endedAt: true,
          report: { select: { summary: true, recommendation: true } },
          questions: {
            orderBy: { orderIndex: "asc" },
            select: {
              orderIndex: true,
              questionText: true,
              difficulty: true,
              answer: {
                select: {
                  id: true,
                  answerText: true,
                  score: true,
                  feedback: true,
                  aiLikelihoodScore: true,
                  audioUrl: true,
                  createdAt: true,
                },
              },
            },
          },
          proctoringEvents: { orderBy: { createdAt: "asc" }, select: { eventType: true, metadata: true, createdAt: true } },
        },
      },
    },
  });
  if (!application || application.jobPosting.recruiterId !== recruiterId) throw notYourApplication();

  const { jobPosting, candidate, resume, interviewSession, ...rest } = application;
  return {
    ...rest,
    job: { id: jobPosting.id, title: jobPosting.title, status: jobPosting.status },
    candidate: { fullName: candidate.fullName, email: candidate.user.email },
    resume: { fileName: resume.fileName ?? "resume.pdf" },
    interviewSession: interviewSession && {
      ...interviewSession,
      questions: interviewSession.questions.map(({ answer, ...question }) => ({
        ...question,
        // The stored recording path stays server-side; the page fetches audio through its own endpoint
        answer: answer && {
          id: answer.id,
          answerText: answer.answerText,
          score: answer.score,
          feedback: answer.feedback,
          aiLikelihoodScore: answer.aiLikelihoodScore,
          createdAt: answer.createdAt,
          isVoice: answer.audioUrl !== null,
        },
      })),
    },
  };
}

export async function getApplicantResumeFile(userId: string, applicationId: string) {
  const recruiterId = await getRecruiterId(userId);
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { jobPosting: { select: { recruiterId: true } }, resume: { select: { fileUrl: true, fileName: true } } },
  });
  if (!application || application.jobPosting.recruiterId !== recruiterId) throw notYourApplication();
  return { ref: application.resume.fileUrl, fileName: application.resume.fileName ?? "resume.pdf" };
}

export async function getAnswerAudio(userId: string, applicationId: string, answerId: string) {
  const recruiterId = await getRecruiterId(userId);
  const answer = await prisma.interviewAnswer.findUnique({
    where: { id: answerId },
    select: {
      audioUrl: true,
      audioMimeType: true,
      question: {
        select: {
          session: {
            select: { applicationId: true, application: { select: { jobPosting: { select: { recruiterId: true } } } } },
          },
        },
      },
    },
  });
  const session = answer?.question.session;
  if (
    !answer?.audioUrl ||
    !session ||
    session.applicationId !== applicationId ||
    session.application.jobPosting.recruiterId !== recruiterId
  ) {
    throw notFound("Recording not found");
  }
  return { ref: answer.audioUrl, contentType: answer.audioMimeType ?? "audio/webm" };
}

export async function updateApplicationStatus(userId: string, applicationId: string, status: ApplicationStatus) {
  const recruiterId = await getRecruiterId(userId);
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      status: true,
      jobPosting: { select: { recruiterId: true, title: true, recruiter: { select: { companyName: true } } } },
      candidate: { select: { fullName: true, user: { select: { email: true } } } },
    },
  });
  if (!application || application.jobPosting.recruiterId !== recruiterId) throw notYourApplication();

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { status },
    select: { id: true, status: true },
  });

  // Tell the candidate about a decision, but not about being moved back to "applied"
  if (status !== application.status && status !== "APPLIED") {
    sendEmailInBackground(
      applicationStatusEmail({
        to: application.candidate.user.email,
        name: application.candidate.fullName,
        jobTitle: application.jobPosting.title,
        companyName: application.jobPosting.recruiter.companyName,
        status,
      })
    );
  }
  return updated;
}
