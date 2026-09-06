import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { listApplicantsForJob, updateApplicationStatus } from "../../api/applicationsApi";
import Navbar from "../../components/common/Navbar";

interface Applicant {
  id: string;
  matchScore: number;
  status: string;
  candidate: { fullName: string };
  skillGaps: { missingSkill: string; importance: string }[];
  interviewSession?: {
    status: string;
    proctoringEvents: { eventType: string }[];
    report?: { summary: string; recommendation: string } | null;
  } | null;
}

export default function ApplicantsPage() {
  const { jobId } = useParams();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [jobId]);

  async function load() {
    try {
      const data: Applicant[] = await listApplicantsForJob(jobId!);
      data.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      setApplicants(data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to load applicants");
    }
  }

  async function handleStatus(applicationId: string, status: "SHORTLISTED" | "REJECTED") {
    try {
      await updateApplicationStatus(applicationId, status);
      setApplicants((prev) => prev.map((a) => (a.id === applicationId ? { ...a, status } : a)));
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to update status");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">Applicants - ranked by match</h1>
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <div className="space-y-3">
          {applicants.map((a, i) => (
            <div key={a.id} className="bg-white p-4 rounded border">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-slate-900">#{i + 1} {a.candidate.fullName}</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-xs ${a.status === "SHORTLISTED" ? "text-green-600" : a.status === "REJECTED" ? "text-red-500" : "text-slate-500"}`}>
                      {a.status}
                    </p>
                    {a.status === "APPLIED" && (
                      <>
                        <button onClick={() => handleStatus(a.id, "SHORTLISTED")} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Shortlist</button>
                        <button onClick={() => handleStatus(a.id, "REJECTED")} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded">Reject</button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-lg font-semibold text-slate-900">{a.matchScore}%</p>
              </div>
              {a.skillGaps.length > 0 && (
                <ul className="mt-2 text-xs text-slate-600 space-y-1">
                  {a.skillGaps.map((g, j) => <li key={j}>- {g.missingSkill} <span className="text-slate-400">({g.importance})</span></li>)}
                </ul>
              )}
              {a.interviewSession && a.interviewSession.proctoringEvents.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Warning: {a.interviewSession.proctoringEvents.length} flag(s) during interview
                </p>
              )}
              <div className="mt-2 pt-2 border-t border-slate-100">
                {!a.interviewSession ? (
                  <p className="text-xs text-slate-400">Interview: Not started</p>
                ) : a.interviewSession.status === "IN_PROGRESS" ? (
                  <p className="text-xs text-amber-600 font-medium">Interview: In progress</p>
                ) : a.interviewSession.report ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Result:</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        a.interviewSession.report.recommendation.toLowerCase().startsWith("strongly recommend")
                          ? "text-green-700 bg-green-50"
                          : a.interviewSession.report.recommendation.toLowerCase().startsWith("recommend")
                          ? "text-green-600 bg-green-50"
                          : a.interviewSession.report.recommendation.toLowerCase().startsWith("consider")
                          ? "text-amber-700 bg-amber-50"
                          : "text-red-600 bg-red-50"
                      }`}>{a.interviewSession.report.recommendation}</span>
                    </div>
                    <p className="text-xs text-slate-600">{a.interviewSession.report.summary}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Interview completed — report pending</p>
                )}
              </div>
            </div>
          ))}
          {applicants.length === 0 && <p className="text-sm text-slate-400">No applicants yet.</p>}
        </div>
      </div>
    </div>
  );
}