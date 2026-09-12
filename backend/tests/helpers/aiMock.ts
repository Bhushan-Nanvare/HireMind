import { vi } from "vitest";

// A stand-in for shared/embeddings: deterministic, offline, and free. Use it with
//   vi.mock("../src/shared/embeddings", async () => (await import("./helpers/aiMock")).embeddingsMock());

const EMBEDDING_SIZE = 16;

/** Same shape of maths as the real thing, so match scores stay believable. */
function fakeEmbedding(text: string): number[] {
  const seed = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 97;
  return Array.from({ length: EMBEDDING_SIZE }, (_, i) => Math.sin((i + 1) * (seed + 1) * 0.05));
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    throw new Error(`Cannot compare embeddings of different sizes (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function embeddingsMock() {
  class AiServiceError extends Error {
    constructor(cause?: unknown) {
      super("The AI service is temporarily unavailable. Please try again in a moment.", { cause });
      this.name = "AiServiceError";
    }
  }

  return {
    AiServiceError,
    cosineSimilarity: cosine,
    generateEmbedding: vi.fn(async (text: string) => fakeEmbedding(text)),
    generateSkillGaps: vi.fn(async () => [
      { skill: "Kubernetes", importance: "high" as const },
      { skill: "GraphQL", importance: "medium" as const },
    ]),
    generateNextQuestion: vi.fn(async (context: { difficulty: string; previousQA: unknown[] }) => {
      return `Test question ${context.previousQA.length + 1} (${context.difficulty})`;
    }),
    // Longer answers score higher, which also exercises the adaptive difficulty
    evaluateAnswer: vi.fn(async (_question: string, answer: string) => ({
      score: answer.length > 40 ? 8 : 3,
      feedback: "Test feedback.",
    })),
    analyzeAnswerAuthenticity: vi.fn(async () => 25),
    generateFinalReport: vi.fn(async () => ({
      summary: "Test summary of the interview.",
      recommendation: "Recommend — test reason.",
    })),
    transcribeAudio: vi.fn(async () => "Transcribed text from the candidate's recording."),
  };
}
