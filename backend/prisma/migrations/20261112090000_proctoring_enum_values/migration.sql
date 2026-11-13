-- New proctoring signals for the conversational interview.
-- Kept in their own migration: a value added by ALTER TYPE cannot be referenced in the same
-- transaction, and Prisma runs each migration file inside one.
ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'CANARY_TRIGGERED';
ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'ANSWER_TIME_EXCEEDED';
ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'TRANSCRIPT_HEAVILY_EDITED';
ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'SPEECH_PATTERN_ANOMALY';
