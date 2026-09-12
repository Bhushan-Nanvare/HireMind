-- Columns that were added to some databases with `prisma db push` but never captured in a migration.
-- IF NOT EXISTS makes this safe both on fresh databases and on databases that already have them.

-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN IF NOT EXISTS "embedding" DOUBLE PRECISION[];

-- AlterTable
ALTER TABLE "Resume" ADD COLUMN IF NOT EXISTS "embedding" DOUBLE PRECISION[];

-- AlterTable
ALTER TABLE "InterviewAnswer" ADD COLUMN IF NOT EXISTS "aiLikelihoodScore" INTEGER;

-- AlterTable
ALTER TABLE "ProctoringEvent" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InterviewQuestion_sessionId_orderIndex_key" ON "InterviewQuestion"("sessionId", "orderIndex");
