-- Warm-up flag and canary text on questions; raw transcript and speech metrics on answers.
-- All additive and nullable (or defaulted), so existing rows stay valid.
ALTER TABLE "InterviewQuestion" ADD COLUMN IF NOT EXISTS "isWarmUp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InterviewQuestion" ADD COLUMN IF NOT EXISTS "canaryToken" TEXT;

ALTER TABLE "InterviewAnswer" ADD COLUMN IF NOT EXISTS "rawTranscript" TEXT;
ALTER TABLE "InterviewAnswer" ADD COLUMN IF NOT EXISTS "voiceMetrics" JSONB;
