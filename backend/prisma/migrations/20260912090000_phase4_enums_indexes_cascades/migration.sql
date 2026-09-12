-- Phase 4: statuses become database enums, foreign keys cascade on delete, and foreign-key columns get
-- indexes. The status columns are converted in place with USING, so existing rows keep their values
-- (Prisma's own diff would have dropped and recreated the columns, losing every status).

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProctoringEventType" AS ENUM ('TAB_SWITCH', 'COPY_PASTE', 'PASTE_BLOCKED_IN_ANSWER', 'SUSPICIOUS_TYPING_SPEED');

-- Normalise anything written while these columns were plain text, so the conversions below can't fail.
-- Rows with an unusable value are reset to the default; expired email tokens are simply dropped.
UPDATE "JobPosting" SET "status" = 'OPEN' WHERE "status" NOT IN ('OPEN', 'CLOSED');
UPDATE "Application" SET "status" = 'APPLIED' WHERE "status" NOT IN ('APPLIED', 'SHORTLISTED', 'REJECTED');
UPDATE "InterviewSession" SET "status" = 'PENDING' WHERE "status" NOT IN ('PENDING', 'IN_PROGRESS', 'COMPLETED');
DELETE FROM "AuthToken" WHERE "type" NOT IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
DELETE FROM "ProctoringEvent" WHERE "eventType" NOT IN ('TAB_SWITCH', 'COPY_PASTE', 'PASTE_BLOCKED_IN_ANSWER', 'SUSPICIOUS_TYPING_SPEED');

-- AlterTable
ALTER TABLE "AuthToken" ALTER COLUMN "type" TYPE "AuthTokenType" USING "type"::"AuthTokenType";

-- AlterTable
ALTER TABLE "JobPosting" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "JobPosting" ALTER COLUMN "status" TYPE "JobStatus" USING "status"::"JobStatus";
ALTER TABLE "JobPosting" ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "Application" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Application" ALTER COLUMN "status" TYPE "ApplicationStatus" USING "status"::"ApplicationStatus";
ALTER TABLE "Application" ALTER COLUMN "status" SET DEFAULT 'APPLIED';

-- AlterTable
ALTER TABLE "InterviewSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "InterviewSession" ALTER COLUMN "status" TYPE "InterviewStatus" USING "status"::"InterviewStatus";
ALTER TABLE "InterviewSession" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ProctoringEvent" ALTER COLUMN "eventType" TYPE "ProctoringEventType" USING "eventType"::"ProctoringEventType";

-- DropForeignKey
ALTER TABLE "Candidate" DROP CONSTRAINT "Candidate_userId_fkey";
ALTER TABLE "Recruiter" DROP CONSTRAINT "Recruiter_userId_fkey";
ALTER TABLE "JobPosting" DROP CONSTRAINT "JobPosting_recruiterId_fkey";
ALTER TABLE "Resume" DROP CONSTRAINT "Resume_candidateId_fkey";
ALTER TABLE "Application" DROP CONSTRAINT "Application_candidateId_fkey";
ALTER TABLE "Application" DROP CONSTRAINT "Application_jobId_fkey";
ALTER TABLE "Application" DROP CONSTRAINT "Application_resumeId_fkey";
ALTER TABLE "InterviewSession" DROP CONSTRAINT "InterviewSession_applicationId_fkey";
ALTER TABLE "InterviewQuestion" DROP CONSTRAINT "InterviewQuestion_sessionId_fkey";
ALTER TABLE "InterviewAnswer" DROP CONSTRAINT "InterviewAnswer_questionId_fkey";
ALTER TABLE "SkillGap" DROP CONSTRAINT "SkillGap_applicationId_fkey";
ALTER TABLE "Report" DROP CONSTRAINT "Report_sessionId_fkey";
ALTER TABLE "ProctoringEvent" DROP CONSTRAINT "ProctoringEvent_sessionId_fkey";

-- AddForeignKey: deleting an account now removes everything that belonged to it. Product rules (a job with
-- applicants, or a resume used in an application, can't be deleted) are enforced in the services.
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recruiter" ADD CONSTRAINT "Recruiter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillGap" ADD CONSTRAINT "SkillGap_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProctoringEvent" ADD CONSTRAINT "ProctoringEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: Postgres doesn't index foreign-key columns on its own, and every list view filters by one
CREATE INDEX IF NOT EXISTS "JobPosting_recruiterId_idx" ON "JobPosting"("recruiterId");
CREATE INDEX IF NOT EXISTS "JobPosting_status_createdAt_idx" ON "JobPosting"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Resume_candidateId_idx" ON "Resume"("candidateId");
CREATE INDEX IF NOT EXISTS "Application_jobId_idx" ON "Application"("jobId");
CREATE INDEX IF NOT EXISTS "Application_resumeId_idx" ON "Application"("resumeId");
CREATE INDEX IF NOT EXISTS "SkillGap_applicationId_idx" ON "SkillGap"("applicationId");
CREATE INDEX IF NOT EXISTS "ProctoringEvent_sessionId_idx" ON "ProctoringEvent"("sessionId");
