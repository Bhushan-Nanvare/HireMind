import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text.slice(0, 8000),
  });
  return result.embeddings![0].values!;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function generateSkillGaps(resumeText: string, jobDescription: string): Promise<{ skill: string; importance: string }[]> {
  const prompt = `Compare this candidate's resume against the job description below. List the specific skills, technologies, or qualifications mentioned in the job description that are missing or weak in the resume.

Resume:
${resumeText.slice(0, 4000)}

Job Description:
${jobDescription}

Respond with ONLY a JSON array, no other text, in this exact format:
[{"skill": "Docker", "importance": "high"}, {"skill": "GraphQL", "importance": "medium"}]

Use "high", "medium", or "low" for importance. If there are no meaningful gaps, respond with an empty array [].`;

  const result = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
  });

  const text = result.text ?? "[]";
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

export async function generateNextQuestion(context: {
  resumeText: string;
  jobDescription: string;
  skillGaps: string[];
  previousQA: { question: string; answer: string; score: number }[];
  difficulty: "easy" | "medium" | "hard";
}): Promise<string> {
  const history = context.previousQA
    .map((qa, i) => `Q${i + 1} (${qa.score}/10): ${qa.question}\nCandidate's answer: ${qa.answer}`)
    .join("\n\n");

  const prompt = `You are an interviewer for a job. Generate ONE interview question at ${context.difficulty} difficulty level.

Job Description:
${context.jobDescription}

Candidate's Resume Summary:
${context.resumeText.slice(0, 2000)}

Key skill gaps to probe: ${context.skillGaps.join(", ") || "none identified"}

Previous questions and answers in this interview:
${history || "This is the first question."}

Generate a new, different question — do not repeat previous topics. Respond with ONLY the question text, nothing else.`;

  const result = await ai.models.generateContent({ model: "gemini-3.6-flash", contents: prompt });
  return (result.text ?? "").trim();
}

export async function evaluateAnswer(question: string, answer: string): Promise<{ score: number; feedback: string }> {
  const prompt = `Evaluate this interview answer on a scale of 0-10.

Question: ${question}
Candidate's Answer: ${answer}

Respond with ONLY JSON in this exact format, no other text:
{"score": 7, "feedback": "Brief 1-2 sentence feedback on strengths and weaknesses."}`;

  const result = await ai.models.generateContent({ model: "gemini-3.6-flash", contents: prompt });
  const text = result.text ?? '{"score":5,"feedback":"Unable to evaluate"}';
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

export async function generateFinalReport(context: {
  jobDescription: string;
  qaHistory: { question: string; answer: string; score: number }[];
}): Promise<{ summary: string; recommendation: string }> {
  const history = context.qaHistory
    .map((qa, i) => `Q${i + 1} (${qa.score}/10): ${qa.question}\nAnswer: ${qa.answer}`)
    .join("\n\n");

  const prompt = `Write a final interview report based on this Q&A history for a job application.

Job Description:
${context.jobDescription}

Interview Q&A:
${history}

Respond with ONLY JSON in this exact format:
{"summary": "2-3 sentence overview of performance, strengths and weaknesses.", "recommendation": "One of: Strongly Recommend, Recommend, Consider, Do Not Recommend — plus a brief reason."}`;

  const result = await ai.models.generateContent({ model: "gemini-3.6-flash", contents: prompt });
  const text = result.text ?? '{"summary":"","recommendation":""}';
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const base64Audio = audioBuffer.toString("base64");

  const result = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: [
      { text: "Transcribe this audio exactly as spoken. Respond with ONLY the transcript text, no commentary." },
      { inlineData: { mimeType, data: base64Audio } },
    ],
  });

  return (result.text ?? "").trim();
}