import dotenv from "dotenv";
// Deliberately NOT override: true. This script rewrites rows, so a DATABASE_URL given on the
// command line has to win over .env, or pointing it at a local database silently hits production.
dotenv.config();

import { splitIntoChunks } from "../src/shared/chunk";
import { EMBEDDING_DIMENSIONS, generateEmbedding, generateEmbeddings } from "../src/shared/embeddings";
import { prisma } from "../src/shared/prisma";

/** Refuses a database that isn't local unless --force is passed. */
function checkTarget() {
  const url = process.env.DATABASE_URL ?? "";
  const local = /@(localhost|127\.0\.0\.1|postgres)[:/]/.test(url);
  if (local || process.argv.includes("--force")) return;

  const host = url.replace(/^.*@/, "").replace(/\/.*$/, "") || "(unset)";
  console.error(
    `Refusing to rewrite embeddings on "${host}": it isn't a local database.\n` +
      "Re-run with --force if that is really what you want."
  );
  process.exit(1);
}

/**
 * Re-embeds every resume and job at the current dimensions and rebuilds resume chunks.
 *
 * Needed after the move to 1536-dimension vectors: anything embedded at the old size can't be
 * compared against new vectors, and chunk embeddings now live in a pgvector column.
 * Run with AI_DRIVER=fake to rebuild locally without spending quota.
 */
async function main() {
  checkTarget();

  const jobs = await prisma.jobPosting.findMany({ select: { id: true, title: true, description: true } });
  console.log(`jobs: ${jobs.length}`);
  for (const job of jobs) {
    const embedding = await generateEmbedding(`${job.title}\n\n${job.description}`);
    await prisma.jobPosting.update({ where: { id: job.id }, data: { embedding } });
    process.stdout.write(".");
  }
  console.log();

  const resumes = await prisma.resume.findMany({ select: { id: true, parsedText: true } });
  console.log(`resumes: ${resumes.length}`);
  for (const resume of resumes) {
    const text = resume.parsedText?.trim();
    if (!text) {
      process.stdout.write("s");
      continue;
    }

    const chunkTexts = splitIntoChunks(text);
    const [embedding, chunkEmbeddings] = await Promise.all([
      generateEmbedding(text),
      generateEmbeddings(chunkTexts),
    ]);

    await prisma.$transaction(async (tx) => {
      await tx.resume.update({ where: { id: resume.id }, data: { embedding } });
      await tx.resumeChunk.deleteMany({ where: { resumeId: resume.id } });
      for (const [index, chunkEmbedding] of chunkEmbeddings.entries()) {
        await tx.$executeRaw`
          INSERT INTO "ResumeChunk" ("id", "resumeId", "text", "orderIndex", "embedding")
          VALUES (gen_random_uuid(), ${resume.id}, ${chunkTexts[index] ?? ""}, ${index},
                  ${JSON.stringify(chunkEmbedding)}::vector)
        `;
      }
    });
    process.stdout.write(".");
  }
  console.log();

  const chunks = await prisma.resumeChunk.count();
  console.log(`done: ${chunks} chunks at ${EMBEDDING_DIMENSIONS} dimensions`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
