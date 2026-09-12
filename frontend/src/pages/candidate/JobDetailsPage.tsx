import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { applyToJob, listMyApplications, type ApplicationStatus, type SkillGap } from "../../api/applicationsApi";
import { getJob } from "../../api/jobsApi";
import { listMyResumes } from "../../api/resumeApi";
import { buttonPrimary, inputClass, labelClass } from "../../components/common/styles";
import {
  ApplicationStatusBadge,
  BackLink,
  Card,
  ErrorMessage,
  JobStatusBadge,
  LoadingState,
  MatchScore,
  PageHeader,
  SkillGapList,
} from "../../components/common/ui";
import { toast } from "../../store/toastStore";
import { errorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

interface AppliedSummary {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  skillGaps: SkillGap[];
  interviewStatus: string | null;
}

export default function JobDetailsPage() {
  const { jobId = "" } = useParams();
  const job = useApiData(() => getJob(jobId), [jobId], "Couldn't load this job.");
  const resumes = useApiData(listMyResumes, [], "Couldn't load your resumes.");
  const applications = useApiData(listMyApplications, [], "Couldn't load your applications.");
  useDocumentTitle(job.data?.title ?? "Job");

  const [chosenResumeId, setChosenResumeId] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [justApplied, setJustApplied] = useState<AppliedSummary | null>(null);

  const existing = applications.data?.find((application) => application.jobPosting.id === jobId);
  const applied: AppliedSummary | null =
    justApplied ??
    (existing
      ? {
          id: existing.id,
          status: existing.status,
          matchScore: existing.matchScore,
          skillGaps: existing.skillGaps,
          interviewStatus: existing.interviewSession?.status ?? null,
        }
      : null);
  const resumeId = chosenResumeId || resumes.data?.[0]?.id || "";

  async function handleApply(e: FormEvent) {
    e.preventDefault();
    if (!resumeId) return;
    setApplying(true);
    setApplyError("");
    try {
      const result = await applyToJob(jobId, resumeId);
      setJustApplied({ ...result, interviewStatus: null });
      toast.success("Application sent.");
    } catch (err) {
      setApplyError(errorMessage(err, "Couldn't apply. Please try again."));
    } finally {
      setApplying(false);
    }
  }

  const back = <BackLink to="/candidate/jobs">All jobs</BackLink>;

  if (job.error) {
    return (
      <>
        {back}
        <div className="mt-4">
          <ErrorMessage message={job.error} />
        </div>
      </>
    );
  }
  if (!job.data) return <LoadingState />;

  function renderApplyPanel() {
    if (applied) {
      const interviewLabel =
        applied.interviewStatus === "COMPLETED"
          ? "View interview results"
          : applied.interviewStatus === "IN_PROGRESS"
            ? "Continue interview"
            : "Start AI interview";
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">You've applied</h2>
            <ApplicationStatusBadge status={applied.status} forCandidate />
          </div>
          <MatchScore score={applied.matchScore} />
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Skills to strengthen</p>
            <SkillGapList gaps={applied.skillGaps} />
          </div>
          <Link to={`/candidate/interview/${applied.id}`} className={`${buttonPrimary} w-full`}>
            {interviewLabel}
          </Link>
        </div>
      );
    }

    if (job.data?.status === "CLOSED") {
      return <p className="text-sm text-slate-600">This job is no longer accepting applications.</p>;
    }
    if (resumes.error) return <ErrorMessage message={resumes.error} />;
    if (!resumes.data || !applications.data) return <LoadingState />;
    if (resumes.data.length === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Upload a resume before applying.</p>
          <Link to="/candidate/dashboard" className={`${buttonPrimary} w-full`}>
            Upload a resume
          </Link>
        </div>
      );
    }

    return (
      <form onSubmit={handleApply} className="space-y-4">
        <h2 className="font-semibold text-slate-900">Apply for this job</h2>
        <div>
          <label htmlFor="resume" className={labelClass}>
            Resume
          </label>
          <select id="resume" value={resumeId} onChange={(e) => setChosenResumeId(e.target.value)} className={inputClass}>
            {resumes.data.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.fileName} ({formatDate(resume.createdAt)})
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">We'll compare your resume with this job and show your match score and skill gaps.</p>
        <ErrorMessage message={applyError} />
        <button type="submit" disabled={applying} className={`${buttonPrimary} w-full`}>
          {applying ? "Analysing your resume…" : "Apply"}
        </button>
      </form>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        <PageHeader
          back={back}
          title={job.data.title}
          description={`${job.data.recruiter.companyName} · Posted ${formatDate(job.data.createdAt)}`}
          actions={job.data.status === "CLOSED" ? <JobStatusBadge status="CLOSED" /> : undefined}
        />
        <Card>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{job.data.description}</p>
        </Card>
      </div>
      <aside className="lg:pt-10">
        <Card>{renderApplyPanel()}</Card>
      </aside>
    </div>
  );
}
