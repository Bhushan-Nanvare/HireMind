import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  listApplicantsForJob,
  updateApplicationStatus,
  type Applicant,
  type ApplicationStatus,
} from "../../api/applicationsApi";
import StatusActions from "../../components/recruiter/StatusActions";
import { buttonSecondary, inputClass } from "../../components/common/styles";
import {
  ApplicationStatusBadge,
  BackLink,
  Badge,
  EmptyState,
  ErrorMessage,
  InterviewStatusBadge,
  JobStatusBadge,
  LoadingState,
  PageHeader,
  RecommendationBadge,
} from "../../components/common/ui";
import { toast } from "../../store/toastStore";
import { confirmStatusChange, statusChangeMessage } from "../../utils/applicationStatus";
import { errorMessage } from "../../utils/errors";
import { formatDate, plural } from "../../utils/format";
import { summarizeSignals } from "../../utils/signals";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

type Filter = "ALL" | ApplicationStatus;
type Sort = "match" | "newest" | "name";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "APPLIED", label: "Applied" },
  { value: "SHORTLISTED", label: "Shortlisted" },
  { value: "REJECTED", label: "Rejected" },
];

function signalCount(applicant: Applicant): number {
  const s = summarizeSignals(applicant.interviewSession);
  return s.tabSwitches + s.pastes + s.blockedPastes + s.fastTyping;
}

export default function ApplicantsPage() {
  const { jobId = "" } = useParams();
  const list = useApiData(() => listApplicantsForJob(jobId), [jobId], "Couldn't load applicants.");
  useDocumentTitle(list.data ? `Applicants: ${list.data.job.title}` : "Applicants");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<Sort>("match");
  const [busyId, setBusyId] = useState<string | null>(null);

  const applicants = list.data?.applicants;
  const visible = useMemo(() => {
    const filtered = (applicants ?? []).filter((a) => filter === "ALL" || a.status === filter);
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.candidate.fullName.localeCompare(b.candidate.fullName);
      if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return (b.matchScore ?? -1) - (a.matchScore ?? -1);
    });
  }, [applicants, filter, sort]);

  async function handleStatus(applicant: Applicant, status: ApplicationStatus) {
    if (!confirmStatusChange(applicant.candidate.fullName, status)) return;
    setBusyId(applicant.id);
    try {
      await updateApplicationStatus(applicant.id, status);
      list.setData(
        (prev) => prev && { ...prev, applicants: prev.applicants.map((a) => (a.id === applicant.id ? { ...a, status } : a)) }
      );
      toast.success(statusChangeMessage(applicant.candidate.fullName, status));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update the status."));
    } finally {
      setBusyId(null);
    }
  }

  const back = <BackLink to="/recruiter/dashboard">Job postings</BackLink>;

  if (list.error) {
    return (
      <>
        {back}
        <div className="mt-4">
          <ErrorMessage message={list.error} />
        </div>
      </>
    );
  }
  if (!list.data) return <LoadingState />;

  const all = list.data.applicants;
  const countFor = (value: Filter) => (value === "ALL" ? all.length : all.filter((a) => a.status === value).length);

  return (
    <>
      <PageHeader
        back={back}
        title={list.data.job.title}
        description={`${plural(all.length, "applicant")}`}
        actions={<JobStatusBadge status={list.data.job.status} />}
      />

      {all.length === 0 ? (
        <EmptyState title="No applicants yet" description="Applications will appear here as candidates apply." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap rounded-md border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="Filter by status">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                  className={`rounded px-3 py-1.5 ${filter === option.value ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
                >
                  {option.label} ({countFor(option.value)})
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${inputClass} w-auto py-1.5`}>
                <option value="match">Best match</option>
                <option value="newest">Newest</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          {visible.length === 0 ? (
            <EmptyState title="No applicants with this status" />
          ) : (
            <ul className="space-y-3">
              {visible.map((applicant) => {
                const session = applicant.interviewSession;
                const signals = signalCount(applicant);
                const detailPath = `/recruiter/applications/${applicant.id}`;
                return (
                  <li key={applicant.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={detailPath} className="font-medium text-slate-900 hover:underline">
                          {applicant.candidate.fullName}
                        </Link>
                        <p className="text-sm text-slate-500">
                          <a href={`mailto:${applicant.candidate.email}`} className="hover:underline">
                            {applicant.candidate.email}
                          </a>{" "}
                          · Applied {formatDate(applicant.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-semibold text-slate-900">
                          {applicant.matchScore === null ? "—" : `${applicant.matchScore}%`}
                        </p>
                        <p className="text-xs text-slate-500">match</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <ApplicationStatusBadge status={applicant.status} />
                      {session?.report ? (
                        <RecommendationBadge recommendation={session.report.recommendation} />
                      ) : (
                        <InterviewStatusBadge status={session?.status ?? null} />
                      )}
                      {signals > 0 && <Badge tone="amber">{plural(signals, "signal")} to review</Badge>}
                    </div>

                    {applicant.skillGaps.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        Gaps: {applicant.skillGaps.slice(0, 4).map((g) => g.missingSkill).join(", ")}
                        {applicant.skillGaps.length > 4 && "…"}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <Link to={detailPath} className={buttonSecondary}>
                        View details
                      </Link>
                      <StatusActions
                        status={applicant.status}
                        busy={busyId === applicant.id}
                        onChange={(status) => handleStatus(applicant, status)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
