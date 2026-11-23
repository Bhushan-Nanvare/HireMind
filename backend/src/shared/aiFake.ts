/**
 * Stand-in responses for AI_DRIVER=fake: deterministic, instant and free.
 *
 * Lets the whole app be exercised — interviews, matching, transcription — without touching Gemini
 * or its quota. Intended for local development and demos; env validation refuses it in production.
 */

const EMBEDDING_SIZE = 1536;

/**
 * Words hashed into buckets, then normalised: texts that share vocabulary end up with similar
 * vectors. A random-per-text vector would be deterministic too, but every match score would come
 * out near zero, which makes a demo look broken.
 */
export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_SIZE).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let bucket = 0;
    for (const char of word) bucket = (bucket * 31 + char.charCodeAt(0)) % EMBEDDING_SIZE;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function fakeSkillGaps() {
  return [
    { skill: "Kubernetes", importance: "high" as const },
    { skill: "GraphQL", importance: "medium" as const },
  ];
}

export function fakeNextQuestion(context: { difficulty: string; previousQA: unknown[] }): string {
  const asked = context.previousQA.length;
  const questions = [
    "Walk me through a service you built end to end. What would you change about it now?",
    "How do you decide where to put a transaction boundary, and what goes wrong when you get it wrong?",
    "Describe a production incident you were part of. What was the root cause?",
    "How would you add caching to a read-heavy endpoint without serving stale data?",
    "What does your testing approach look like for something with an external API in the middle?",
  ];
  return `${questions[asked % questions.length]} (${context.difficulty})`;
}

/** Longer answers score higher, which also exercises the adaptive difficulty. */
export function fakeEvaluation(answer: string) {
  const score = answer.length > 200 ? 9 : answer.length > 40 ? 7 : 3;
  return {
    score,
    feedback:
      score >= 7
        ? "Clear and specific, with a concrete example. Could say more about the trade-offs you weighed."
        : "Too brief to judge. Give a specific situation and what you actually did.",
    aiLikelihood: answer.length >= 30 ? 25 : null,
  };
}

export function fakeReport() {
  return {
    summary:
      "The candidate answered consistently and gave concrete examples from their own work. Strongest on data modelling, least convincing on operational trade-offs.",
    recommendation: "Recommend — solid fundamentals and clear communication.",
  };
}

export function fakeTranscript(): string {
  return "I worked on the billing service, mostly the part that reconciles payments against invoices at the end of each day.";
}
