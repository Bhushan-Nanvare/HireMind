import api from "./axiosClient";
import { getBlob } from "./files";

export interface ResumeSummary {
  id: string;
  fileName: string;
  createdAt: string;
  /** The start of the text read from the PDF */
  preview: string;
  /** Applications that used this resume. A resume in use can't be deleted. */
  applicationCount: number;
}

export async function uploadResume(file: File): Promise<ResumeSummary> {
  const formData = new FormData();
  formData.append("resume", file);
  const res = await api.post("/resumes/upload", formData);
  return res.data.data;
}

export async function listMyResumes(): Promise<ResumeSummary[]> {
  const res = await api.get("/resumes/mine");
  return res.data.data;
}

export function fetchResumeFile(resumeId: string): Promise<Blob> {
  return getBlob(`/resumes/${resumeId}/file`);
}

export async function deleteResume(resumeId: string): Promise<void> {
  await api.delete(`/resumes/${resumeId}`);
}
