-- CreateEnum
CREATE TYPE "McqEventType" AS ENUM ('TAB_SWITCH', 'COPY_PASTE', 'ANSWERED_TOO_FAST');

-- CreateTable
CREATE TABLE "McqTest" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "passPercent" INTEGER NOT NULL,
    "showResult" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McqTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McqQuestion" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "options" TEXT[],
    "correct" INTEGER[],
    "topic" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McqQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McqAttempt" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "score" INTEGER,
    "total" INTEGER,

    CONSTRAINT "McqAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McqAttemptQuestion" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "optionOrder" INTEGER[],
    "selected" INTEGER[],
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "McqAttemptQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McqEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "eventType" "McqEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McqEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McqTest_jobId_key" ON "McqTest"("jobId");

-- CreateIndex
CREATE INDEX "McqQuestion_testId_position_idx" ON "McqQuestion"("testId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "McqAttempt_applicationId_key" ON "McqAttempt"("applicationId");

-- CreateIndex
CREATE INDEX "McqAttempt_testId_idx" ON "McqAttempt"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "McqAttemptQuestion_attemptId_orderIndex_key" ON "McqAttemptQuestion"("attemptId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "McqAttemptQuestion_attemptId_questionId_key" ON "McqAttemptQuestion"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "McqEvent_attemptId_idx" ON "McqEvent"("attemptId");

-- AddForeignKey
ALTER TABLE "McqTest" ADD CONSTRAINT "McqTest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McqQuestion" ADD CONSTRAINT "McqQuestion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "McqTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McqAttempt" ADD CONSTRAINT "McqAttempt_testId_fkey" FOREIGN KEY ("testId") REFERENCES "McqTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McqAttempt" ADD CONSTRAINT "McqAttempt_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McqAttemptQuestion" ADD CONSTRAINT "McqAttemptQuestion_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "McqAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McqAttemptQuestion" ADD CONSTRAINT "McqAttemptQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "McqQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McqEvent" ADD CONSTRAINT "McqEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "McqAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

