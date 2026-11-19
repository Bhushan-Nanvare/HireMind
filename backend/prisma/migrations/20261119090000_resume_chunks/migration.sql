CREATE TABLE IF NOT EXISTS "ResumeChunk" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "embedding" DOUBLE PRECISION[],

    CONSTRAINT "ResumeChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ResumeChunk_resumeId_idx" ON "ResumeChunk"("resumeId");

ALTER TABLE "ResumeChunk" DROP CONSTRAINT IF EXISTS "ResumeChunk_resumeId_fkey";
ALTER TABLE "ResumeChunk" ADD CONSTRAINT "ResumeChunk_resumeId_fkey"
    FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
