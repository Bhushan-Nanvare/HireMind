import api from "./axiosClient";

export type JobStatus = "OPEN" | "CLOSED";

/** A job as candidates see it */
export interface PublicJob {
  id: string;
  title: string;
  description: string;
  status: JobStatus;
  createdAt: string;
  recruiter: { companyName: string };
}

/** A recruiter's own job posting */
export interface OwnJob {
  id: string;
  title: string;
  description: string;
  status: JobStatus;
  createdAt: string;
  applicantCount: number;
}

/** Open jobs only */
export async function listJobs(): Promise<PublicJob[]> {
  const res = await api.get("/jobs");
  return res.data.data;
}

export async function getJob(jobId: string): Promise<PublicJob> {
  const res = await api.get(`/jobs/${jobId}`);
  return res.data.data;
}

export async function listMyJobs(): Promise<OwnJob[]> {
  const res = await api.get("/jobs/mine");
  return res.data.data;
}

export async function createJob(title: string, description: string): Promise<OwnJob> {
  const res = await api.post("/jobs", { title, description });
  return res.data.data;
}

export async function updateJob(jobId: string, title: string, description: string): Promise<OwnJob> {
  const res = await api.patch(`/jobs/${jobId}`, { title, description });
  return res.data.data;
}

export async function setJobStatus(jobId: string, status: JobStatus): Promise<OwnJob> {
  const res = await api.patch(`/jobs/${jobId}/status`, { status });
  return res.data.data;
}

/** Only allowed while the job has no applicants */
export async function deleteJob(jobId: string): Promise<void> {
  await api.delete(`/jobs/${jobId}`);
}
