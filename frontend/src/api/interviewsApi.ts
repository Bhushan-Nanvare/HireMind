import api from "./axiosClient";

export interface InterviewQuestion {
  id: string;
  questionText: string;
  difficulty: string;
  orderIndex: number;
}

export interface InterviewReport {
  summary: string;
  recommendation: string;
}

/** The interview's current step, returned by the start (start-or-resume) and answer endpoints. */
export interface InterviewState {
  session: { id: string; status: string };
  /** Null when the interview is done, or when the next step failed to generate and needs a retry. */
  question: InterviewQuestion | null;
  totalQuestions: number;
  done: boolean;
  report: InterviewReport | null;
}

export interface AnswerResult extends InterviewState {
  score: number;
  feedback: string;
}

/** The interview for an application without starting it. `interview` is null until the candidate starts. */
export interface InterviewOverview {
  jobTitle: string;
  companyName: string;
  interview: InterviewState | null;
}

/** The candidate's own record of a session: their answers with scores and feedback */
export interface InterviewTranscript {
  id: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  report: InterviewReport | null;
  questions: {
    id: string;
    questionText: string;
    difficulty: string;
    orderIndex: number;
    answer: { answerText: string; score: number | null; feedback: string | null; isVoice: boolean } | null;
  }[];
}

export type ProctoringEventType = "TAB_SWITCH" | "COPY_PASTE" | "PASTE_BLOCKED_IN_ANSWER";

export async function getInterviewOverview(applicationId: string): Promise<InterviewOverview> {
  const res = await api.get(`/interviews/by-application/${applicationId}`);
  return res.data.data;
}

/** Starts the interview for an application, or resumes it where the candidate left off. */
export async function startInterview(applicationId: string): Promise<InterviewState> {
  const res = await api.post("/interviews/start", { applicationId });
  return res.data.data;
}

export async function submitAnswer(
  sessionId: string,
  questionId: string,
  answerText: string,
  timeTakenSeconds: number
): Promise<AnswerResult> {
  const res = await api.post(`/interviews/${sessionId}/answer`, { questionId, answerText, timeTakenSeconds });
  return res.data.data;
}

/** Uploads a spoken answer; the API transcribes it and scores the transcript. */
export async function submitAudioAnswer(
  sessionId: string,
  questionId: string,
  recording: Blob,
  fileName: string
): Promise<AnswerResult> {
  const form = new FormData();
  form.append("questionId", questionId);
  form.append("audio", recording, fileName);
  const res = await api.post(`/interviews/${sessionId}/answer-audio`, form);
  return res.data.data;
}

export async function getTranscript(sessionId: string): Promise<InterviewTranscript> {
  const res = await api.get(`/interviews/${sessionId}`);
  return res.data.data;
}

/** Fire-and-forget: a failed proctoring log must never interrupt the interview. */
export function logProctoringEvent(sessionId: string, eventType: ProctoringEventType) {
  api.post(`/interviews/${sessionId}/proctoring`, { eventType }).catch(() => {});
}
