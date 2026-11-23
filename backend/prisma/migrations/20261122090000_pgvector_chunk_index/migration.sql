-- Indexed vector search for resume chunks.
-- Chunk embeddings are derived data, so the old float array is dropped rather than converted;
-- `npm run backfill:embeddings` regenerates them at the new 1536 dimensions.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "ResumeChunk" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "ResumeChunk" ADD COLUMN "embedding" vector(1536);

-- Cosine distance, matching the similarity used everywhere else.
-- Named the way Prisma names indexes, so schema drift checks stay clean even though
-- Prisma can only describe this as a plain index.
CREATE INDEX IF NOT EXISTS "ResumeChunk_embedding_idx"
    ON "ResumeChunk" USING hnsw ("embedding" vector_cosine_ops);
