import { cosineSimilarity } from "./embeddings";

export type ScorableResume = {
  embedding: number[];
  chunks: { text: string; embedding: number[] }[];
};

/**
 * Best-matching section of a resume, falling back to the whole document for resumes uploaded
 * before chunking existed. Shared with the eval harness so both score the same way.
 */
export function bestMatch(
  jobEmbedding: number[],
  resume: ScorableResume
): { score: number; evidence: string | null } | null {
  let score = -1;
  let evidence: string | null = null;

  for (const chunk of resume.chunks) {
    if (chunk.embedding.length !== jobEmbedding.length) continue;
    const similarity = cosineSimilarity(jobEmbedding, chunk.embedding);
    if (similarity > score) {
      score = similarity;
      evidence = chunk.text;
    }
  }

  if (score < 0 && resume.embedding.length === jobEmbedding.length) {
    score = cosineSimilarity(jobEmbedding, resume.embedding);
  }
  return score < 0 ? null : { score, evidence };
}

export function toMatchPercent(score: number): number {
  return Math.round(Math.min(Math.max(score, 0), 1) * 100);
}
