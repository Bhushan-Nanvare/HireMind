import api from "./axiosClient";

export async function applyToJob(jobId: string, resumeId: string) {
  const res = await api.post("/applications", { jobId, resumeId });
  return res.data.data;
}

export async function listMyApplications() {
  const res = await api.get("/applications/mine");
  return res.data.data;
}

export async function listApplicantsForJob(jobId: string) {
  const res = await api.get(`/applications/job/${jobId}`);
  return res.data.data;
}

export async function updateApplicationStatus(applicationId: string, status: "SHORTLISTED" | "REJECTED") {
  const res = await api.patch(`/applications/${applicationId}/status`, { status });
  return res.data.data;
}