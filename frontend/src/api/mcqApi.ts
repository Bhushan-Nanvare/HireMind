import api from "./axiosClient";

export interface TestSettings {
  title: string;
  durationMinutes: number;
  questionCount: number;
  passPercent: number;
  showResult: boolean;
  published: boolean;
}

export interface QuestionInput {
  text: string;
  options: string[];
  correct: number[];
  topic?: string;
}

export interface BuilderQuestion {
  id: string;
  text: string;
  options: string[];
  correct: number[];
  topic: string | null;
  shown: number;
  correctCount: number;
}

export interface BuilderData {
  test: (TestSettings & { attemptCount: number }) | null;
  questions: BuilderQuestion[];
}

export interface AssessmentResult {
  test: { title: string; passPercent: number; showResult: boolean } | null;
  attempt: {
    status: "IN_PROGRESS" | "SUBMITTED";
    startedAt: string;
    submittedAt: string | null;
    durationSeconds: number | null;
    score: number | null;
    total: number | null;
    percent: number | null;
    passed: boolean | null;
    topics: { topic: string; correct: number; total: number }[];
    questions: {
      number: number;
      text: string;
      topic: string | null;
      options: string[];
      correct: number[];
      selected: number[];
      isCorrect: boolean;
    }[];
    events: { eventType: string; metadata: Record<string, unknown> | null; createdAt: string }[];
  } | null;
}

export interface PaperQuestion {
  id: string;
  text: string;
  options: string[];
  multiple: boolean;
  selected: number[];
}

export interface AttemptView {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED";
  title: string;
  expiresAt: string;
  secondsLeft: number;
  result: { score: number; total: number; percent: number; passed: boolean } | null;
  questions: PaperQuestion[];
}

export interface AssessmentOverview {
  jobTitle: string;
  companyName: string;
  test: { title: string; durationMinutes: number; questionCount: number; passPercent: number } | null;
  attempt: AttemptView | null;
}

export async function getBuilder(jobId: string): Promise<BuilderData> {
  return (await api.get(`/mcq/jobs/${jobId}/test`)).data.data;
}

export async function saveTest(jobId: string, settings: TestSettings): Promise<void> {
  await api.put(`/mcq/jobs/${jobId}/test`, settings);
}

export async function addQuestion(jobId: string, question: QuestionInput): Promise<void> {
  await api.post(`/mcq/jobs/${jobId}/questions`, { questions: [question] });
}

export async function importQuestions(jobId: string, csv: string): Promise<number> {
  return (await api.post(`/mcq/jobs/${jobId}/questions/import`, { csv })).data.data.added;
}

export async function updateQuestion(questionId: string, question: QuestionInput): Promise<void> {
  await api.put(`/mcq/questions/${questionId}`, question);
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await api.delete(`/mcq/questions/${questionId}`);
}

export async function getAssessmentResult(applicationId: string): Promise<AssessmentResult> {
  return (await api.get(`/mcq/applications/${applicationId}/result`)).data.data;
}

export async function getAssessmentOverview(applicationId: string): Promise<AssessmentOverview> {
  return (await api.get(`/mcq/applications/${applicationId}`)).data.data;
}

export async function startAssessment(applicationId: string): Promise<AttemptView> {
  return (await api.post(`/mcq/applications/${applicationId}/start`)).data.data;
}

export async function saveAnswer(attemptId: string, questionId: string, selected: number[]): Promise<void> {
  await api.put(`/mcq/attempts/${attemptId}/answers/${questionId}`, { selected });
}

export async function submitAssessment(attemptId: string): Promise<AttemptView> {
  return (await api.post(`/mcq/attempts/${attemptId}/submit`)).data.data;
}

export function logAssessmentEvent(attemptId: string, eventType: "TAB_SWITCH" | "COPY_PASTE") {
  api.post(`/mcq/attempts/${attemptId}/events`, { eventType }).catch(() => {});
}
