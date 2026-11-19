import dotenv from "dotenv";
dotenv.config({ override: true });

import fs from "fs";
import path from "path";
import { splitIntoChunks } from "../src/shared/chunk";
import { generateEmbedding, generateEmbeddings } from "../src/shared/embeddings";
import { bestMatch } from "../src/shared/matching";

interface GoldenResume {
  id: string;
  relevance: number;
  text: string;
}

interface GoldenCase {
  name: string;
  job: { title: string; description: string };
  resumes: GoldenResume[];
}

const RELEVANT_FROM = 2;

function dcg(relevances: number[]): number {
  return relevances.reduce((total, relevance, index) => total + relevance / Math.log2(index + 2), 0);
}

function ndcg(ranked: number[]): number {
  const ideal = dcg([...ranked].sort((a, b) => b - a));
  return ideal === 0 ? 1 : dcg(ranked) / ideal;
}

/** R-precision: of the top R results, how many are relevant, where R is how many relevant ones exist. */
function rPrecision(ranked: number[]): number {
  const relevant = ranked.filter((relevance) => relevance >= RELEVANT_FROM).length;
  if (relevant === 0) return 1;
  return ranked.slice(0, relevant).filter((relevance) => relevance >= RELEVANT_FROM).length / relevant;
}

async function scoreCase(testCase: GoldenCase, calls: { count: number }) {
  const jobEmbedding = await generateEmbedding(`${testCase.job.title}\n\n${testCase.job.description}`);
  calls.count += 1;

  const scored = [];
  for (const resume of testCase.resumes) {
    const chunkTexts = splitIntoChunks(resume.text);
    const chunkEmbeddings = await generateEmbeddings(chunkTexts);
    calls.count += 1;

    const match = bestMatch(jobEmbedding, {
      embedding: [],
      chunks: chunkEmbeddings.map((embedding, index) => ({ text: chunkTexts[index] ?? "", embedding })),
    });
    scored.push({ ...resume, score: match?.score ?? 0, evidence: match?.evidence ?? "" });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function main() {
  const file = path.join(__dirname, "golden-set.json");
  const cases = JSON.parse(fs.readFileSync(file, "utf8")) as GoldenCase[];
  const calls = { count: 0 };
  const results: { name: string; precision: number; ndcg: number }[] = [];

  for (const testCase of cases) {
    const ranked = await scoreCase(testCase, calls);
    const relevances = ranked.map((resume) => resume.relevance);
    const precision = rPrecision(relevances);
    const quality = ndcg(relevances);
    results.push({ name: testCase.name, precision, ndcg: quality });

    console.log(`\n${testCase.name}`);
    console.log(`  r-precision ${precision.toFixed(2)}   ndcg ${quality.toFixed(3)}`);
    for (const [index, resume] of ranked.entries()) {
      const flag = resume.relevance >= RELEVANT_FROM ? "+" : " ";
      console.log(`  ${flag} ${index + 1}. ${resume.id.padEnd(24)} score ${resume.score.toFixed(3)}  relevance ${resume.relevance}`);
    }
    const top = ranked[0];
    if (top?.evidence) console.log(`      matched on: "${top.evidence.split("\n")[0]}"`);
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  console.log("\n────────────────────────────────");
  console.log(`cases             ${results.length}`);
  console.log(`mean r-precision  ${mean(results.map((r) => r.precision)).toFixed(3)}`);
  console.log(`mean ndcg         ${mean(results.map((r) => r.ndcg)).toFixed(3)}`);
  console.log(`embedding calls   ${calls.count}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
