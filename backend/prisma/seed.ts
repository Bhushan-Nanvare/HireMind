/**
 * Demo data for local development: a recruiter with three jobs, a candidate with a resume, one finished
 * interview and one application waiting to start. Embeddings and AI text are faked, so this uses no Gemini
 * quota. Running it again replaces the demo accounts.
 *
 *   npm run seed
 */
import bcrypt from "bcrypt";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const PASSWORD = "demo-password-123";
const RECRUITER_EMAIL = "demo-recruiter@hiremind.test";
const CANDIDATE_EMAIL = "demo-candidate@hiremind.test";
const EMBEDDING_SIZE = 3072;

/** Stand-in for a Gemini embedding: stable, and similar vectors give a believable match score. */
function fakeEmbedding(offset: number): number[] {
  return Array.from({ length: EMBEDDING_SIZE }, (_, i) => Math.sin((i + offset) * 0.01));
}

const RESUME_TEXT = `Alex Rivera - Backend Developer
Summary: 4 years building REST APIs with Node.js, Express and TypeScript.
Experience: Payment and order services backed by PostgreSQL and Redis. Wrote integration tests with Jest.
Skills: JavaScript, TypeScript, Node.js, Express, PostgreSQL, Redis, Git, REST APIs
Education: B.Tech Computer Science`;

const INTERVIEW = [
  {
    question: "Tell me about a service you built with Node.js and PostgreSQL.",
    difficulty: "medium",
    answer: "I built an orders service in Express with a PostgreSQL store, using transactions for writes that had to stay consistent.",
    score: 7,
    feedback: "Concrete example with a clear reason for transactions.",
    aiLikelihoodScore: 18,
  },
  {
    question: "How would you find and fix a slow endpoint?",
    difficulty: "hard",
    answer: "Measure first: request timing logs, then EXPLAIN ANALYZE on the queries. Most of our problems were missing indexes and N+1 queries.",
    score: 8,
    feedback: "Good instinct to measure before changing anything.",
    aiLikelihoodScore: 24,
  },
  {
    question: "How do you decide what to cache, and how do you invalidate it?",
    difficulty: "hard",
    answer: "I cache reads that are expensive and tolerate being slightly stale, with a short TTL, and I invalidate on write for anything user-facing.",
    score: 6,
    feedback: "Reasonable rules, but no mention of measuring hit rates.",
    aiLikelihoodScore: 40,
  },
  {
    question: "What's your experience with Docker and Kubernetes?",
    difficulty: "medium",
    answer: "I have containerised Node services with Docker. Kubernetes I only know at a high level, from reading rather than running it.",
    score: 4,
    feedback: "Honest about the gap, but limited depth for an infrastructure-heavy role.",
    aiLikelihoodScore: 12,
  },
  {
    question: "How do you keep an API reliable when a dependency fails?",
    difficulty: "medium",
    answer: "Timeouts on every call, retries with backoff for idempotent work, and a fallback response so one slow dependency doesn't take the API down.",
    score: 7,
    feedback: "Covers the main patterns and why each one matters.",
    aiLikelihoodScore: 30,
  },
];

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error("Refusing to seed a production database. Pass --force if that's really what you want.");
    process.exit(1);
  }

  // Deleting the users cascades to their jobs, resumes, applications and interviews
  await prisma.user.deleteMany({ where: { email: { in: [RECRUITER_EMAIL, CANDIDATE_EMAIL] } } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const verifiedAt = new Date();

  const recruiter = await prisma.recruiter.create({
    data: {
      companyName: "Northwind Labs",
      user: { create: { email: RECRUITER_EMAIL, passwordHash, role: "RECRUITER", emailVerifiedAt: verifiedAt } },
    },
  });

  const candidate = await prisma.candidate.create({
    data: {
      fullName: "Alex Rivera",
      user: { create: { email: CANDIDATE_EMAIL, passwordHash, role: "CANDIDATE", emailVerifiedAt: verifiedAt } },
    },
  });

  const backendJob = await prisma.jobPosting.create({
    data: {
      recruiterId: recruiter.id,
      title: "Senior Backend Engineer (Node.js)",
      description:
        "Build and run our order and payment services. You'll work with Node.js, TypeScript and PostgreSQL, deploy with Docker and Kubernetes, and own reliability for the services you ship. We're looking for 4+ years of backend experience, comfort with SQL performance work, and clear written communication.",
      embedding: fakeEmbedding(0),
    },
  });

  const platformJob = await prisma.jobPosting.create({
    data: {
      recruiterId: recruiter.id,
      title: "Platform Engineer",
      description:
        "Own the cloud platform our product teams deploy to: Terraform, AWS, Kubernetes, and observability with Grafana and Prometheus. Go or Node.js experience both welcome.",
      embedding: fakeEmbedding(400),
    },
  });

  await prisma.jobPosting.create({
    data: {
      recruiterId: recruiter.id,
      title: "Frontend Engineer (React)",
      description: "Closed for now: we filled this role. Kept here to show how closed postings look.",
      status: "CLOSED",
      embedding: fakeEmbedding(800),
    },
  });

  const resume = await prisma.resume.create({
    data: {
      candidateId: candidate.id,
      // No real file: opening it returns "This file is no longer available", which is the expected behaviour
      fileUrl: "uploads/resumes/demo-seed-resume",
      fileName: "Alex Rivera CV.pdf",
      parsedText: RESUME_TEXT,
      embedding: fakeEmbedding(20),
    },
  });

  // Application 1: interview finished, with a report and a couple of integrity signals
  const finished = await prisma.application.create({
    data: {
      candidateId: candidate.id,
      jobId: backendJob.id,
      resumeId: resume.id,
      matchScore: 74,
      status: "SHORTLISTED",
      skillGaps: {
        create: [
          { missingSkill: "Kubernetes", importance: "high" },
          { missingSkill: "AWS (ECS, Lambda)", importance: "medium" },
          { missingSkill: "Prometheus monitoring", importance: "low" },
        ],
      },
    },
  });

  const startedAt = new Date(Date.now() - 45 * 60 * 1000);
  await prisma.interviewSession.create({
    data: {
      applicationId: finished.id,
      status: "COMPLETED",
      startedAt,
      endedAt: new Date(startedAt.getTime() + 18 * 60 * 1000),
      questions: {
        create: INTERVIEW.map((step, index) => ({
          questionText: step.question,
          difficulty: step.difficulty,
          orderIndex: index + 1,
          answer: {
            create: {
              answerText: step.answer,
              score: step.score,
              feedback: step.feedback,
              aiLikelihoodScore: step.aiLikelihoodScore,
            },
          },
        })),
      },
      proctoringEvents: {
        create: [
          { eventType: "TAB_SWITCH" },
          { eventType: "PASTE_BLOCKED_IN_ANSWER" },
          { eventType: "SUSPICIOUS_TYPING_SPEED", metadata: { charsPerSecond: 19.4, answerLength: 142, timeTakenSeconds: 7.3 } },
        ],
      },
      report: {
        create: {
          summary:
            "Solid mid-to-senior backend engineer: strong on Node.js, SQL performance and reliability patterns, with concrete examples. Infrastructure depth is thinner, and Kubernetes is self-taught rather than operated.",
          recommendation: "Recommend — strong backend fundamentals, but confirm the infrastructure gap in a follow-up.",
        },
      },
    },
  });

  // Application 2: applied, interview not started yet
  await prisma.application.create({
    data: {
      candidateId: candidate.id,
      jobId: platformJob.id,
      resumeId: resume.id,
      matchScore: 52,
      skillGaps: {
        create: [
          { missingSkill: "Terraform", importance: "high" },
          { missingSkill: "Go", importance: "medium" },
        ],
      },
    },
  });

  console.log(`Seeded demo data.

  Recruiter: ${RECRUITER_EMAIL}
  Candidate: ${CANDIDATE_EMAIL}
  Password for both: ${PASSWORD}

Both accounts are already email-verified. The candidate has one finished interview and one to start.`);
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
