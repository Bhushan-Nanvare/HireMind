import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { listMyApplications } from "../../api/applicationsApi";
import Navbar from "../../components/common/Navbar";

interface SkillGap {
  missingSkill: string;
  importance: string;
}

interface Report {
  summary: string;
  recommendation: string;
}

interface InterviewSession {
  id: string;
  status: string;
  report?: Report | null;
}

interface Application {
  id: string;
  status: string;
  matchScore: number | null;
  jobPosting: { title: string; description: string };
  skillGaps: SkillGap[];
  interviewSession?: InterviewSession | null;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    APPLIED: "bg-slate-100 text-slate-600",
    SHORTLISTED: "bg-green-50 text-green-700",
    REJECTED: "bg-red-50 text-red-600",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? styles.APPLIED}`}>
      {status}
    </span>
  );
}

function ImportanceDot({ importance }: { importance: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-400",
    medium: "bg-amber-400",
    low: "bg-slate-300",
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${colors[importance] ?? "bg-slate-300"}`} />;
}

function InterviewSection({ application }: { application: Application }) {
  const session = application.interviewSession;

  if (!session) {
    return (
      <div className="mt-3 pt-3 border-t border-slate-100">
        <Link
          to={`/candidate/interview/${application.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-slate-600 transition-colors"
        >
          Start AI Interview →
        </Link>
        <p className="text-xs text-slate-400 mt-0.5">Your interview has not started yet</p>
      </div>
    );
  }

  if (session.status === "IN_PROGRESS") {
    return (
      <div className="mt-3 pt-3 border-t border-slate-100">
        <span className="inline-block text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mb-1">
          Interview in progress
        </span>
        <br />
        <Link
          to={`/candidate/interview/${application.id}`}
          className="text-sm font-medium text-slate-900 hover:text-slate-600 transition-colors"
        >
          Resume interview →
        </Link>
      </div>
    );
  }

  if (session.report) {
    const rec = session.report.recommendation;
    const recLower = rec ? rec.toLowerCase() : "";
    const recColor = recLower.startsWith("strongly recommend")
      ? "text-green-700 bg-green-50"
      : recLower.startsWith("recommend")
        ? "text-green-600 bg-green-50"
        : recLower.startsWith("consider")
          ? "text-amber-700 bg-amber-50"
          : "text-red-600 bg-red-50";

    return (
      <>
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Interview result:</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${recColor}`}>
              {rec}
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {session.report.summary}
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <span className="text-xs text-slate-400">Interview completed — report generating…</span>
    </div>
  );
}

export default function MyApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data: Application[] = await listMyApplications();
        setApplications(data);
      } catch (err: any) {
        setError(err.response?.data?.error || "Failed to load applications");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-2xl mx-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">My applications</h1>
          <Link to="/candidate/jobs" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            Browse more jobs →
          </Link>
        </div>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : applications.length === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center">
            <p className="text-sm text-slate-500">You have not applied to any jobs yet.</p>
            <Link to="/candidate/jobs" className="inline-block mt-3 text-sm text-slate-900 font-medium underline">
              Browse open positions →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <div key={app.id} className="bg-white rounded-lg border p-5">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{app.jobPosting.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={app.status} />
                      {app.matchScore != null && (
                        <span className="text-xs text-slate-500">
                          Match: <span className="font-semibold text-slate-800">{app.matchScore}%</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {app.skillGaps.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {app.skillGaps.map((g, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-center">
                        <ImportanceDot importance={g.importance} />
                        {g.missingSkill}
                        <span className="ml-1 text-slate-400">({g.importance})</span>
                      </li>
                    ))}
                  </ul>
                )}

                <InterviewSection application={app} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
