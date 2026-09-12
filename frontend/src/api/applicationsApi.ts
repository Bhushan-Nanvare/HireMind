import api from "./axiosClient";
import { getBlob } from "./files";
import type { JobStatus } from "./jobsApi";

export type ApplicationStatus = "APPLIED" | "SHORTLISTED" | "REJECTED";

export interface SkillGap {
  missingSkill: string;
  importance: string;
}

export interface Report {
  summary: string;
  recommendation: string;
}

export interface ApplyResult {
  id: string;
  matchScore: number | null;
  status: ApplicationStatus;
  skillGaps: SkillGap[];
}

/** One of the candidate's own applications */
export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  createdAt: string;
  jobPosting: { id: string; title: string; status: JobStatus; recruiter: { companyName: string } };
  skillGaps: SkillGap[];
  interviewSession: { id: string; status: string; report: Report | null } | null;
}

/** A row in the recruiter's applicant list */
export interface Applicant {
  id: string;
  matchScore: number | null;
  status: ApplicationStatus;
  createdAt: string;
  candidate: { fullName: string; email: string };
  skillGaps: SkillGap[];
  interviewSession: {
    status: string;
    report: Report | null;
    proctoringEvents: { eventType: string }[];
    questions: { answer: { aiLikelihoodScore: number | null } | null }[];
  } | null;
}

export interface ApplicantList {
  job: { id: string; title: string; status: JobStatus };
  applicants: Applicant[];
}

export interface TranscriptAnswer {
  id: string;
  answerText: string;
  score: number | null;
  feedback: string | null;
  aiLikelihoodScore: number | null;
  createdAt: string;
  isVoice: boolean;
}

/** Everything the recruiter's applicant page shows */
export interface ApplicationDetail {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  createdAt: string;
  job: { id: string; title: string; status: JobStatus };
  candidate: { fullName: string; email: string };
  resume: { fileName: string };
  skillGaps: SkillGap[];
  interviewSession: {
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    report: Report | null;
    questions: { orderIndex: number; questionText: string; difficulty: string; answer: TranscriptAnswer | null }[];
    proctoringEvents: { eventType: string; metadata: Record<string, unknown> | null; createdAt: string }[];
  } | null;
}

export async function applyToJob(jobId: string, resumeId: string): Promise<ApplyResult> {
  const res = await api.post("/applications", { jobId, resumeId });
  return res.data.data;
}

export async function listMyApplications(): Promise<MyApplication[]> {
  const res = await api.get("/applications/mine");
  return res.data.data;
}

export async function listApplicantsForJob(jobId: string): Promise<ApplicantList> {
  const res = await api.get(`/applications/job/${jobId}`);
  return res.data.data;
}

export async function getApplication(applicationId: string): Promise<ApplicationDetail> {
  const res = await api.get(`/applications/${applicationId}`);
  return res.data.data;
}

/** Shortlisting or rejecting emails the candidate; moving back to APPLIED doesn't. */
export async function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus
): Promise<{ id: string; status: ApplicationStatus }> {
  const res = await api.patch(`/applications/${applicationId}/status`, { status });
  return res.data.data;
}

export function fetchApplicantResume(applicationId: string): Promise<Blob> {
  return getBlob(`/applications/${applicationId}/resume`);
}

export function fetchAnswerRecording(applicationId: string, answerId: string): Promise<Blob> {
  return getBlob(`/applications/${applicationId}/answers/${answerId}/audio`);
}
