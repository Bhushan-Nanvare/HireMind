import { Link } from "react-router-dom";
import { listMyApplications, type MyApplication } from "../../api/applicationsApi";
import { buttonPrimary, buttonSecondary } from "../../components/common/styles";
import {
  ApplicationStatusBadge,
  Badge,
  Card,
  EmptyState,
  ErrorMessage,
  LoadingState,
  PageHeader,
  RecommendationBadge,
  SkillGapList,
} from "../../components/common/ui";
import { formatDate } from "../../utils/format";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

function InterviewSection({ application }: { application: MyApplication }) {
  const session = application.interviewSession;
  const interviewPath = `/candidate/interview/${application.id}`;

  if (!session) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Your AI interview hasn't started yet.</p>
        <Link to={interviewPath} className={buttonPrimary}>
          Start AI interview
        </Link>
      </div>
    );
  }

  if (session.status !== "COMPLETED") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone="amber">Interview in progress</Badge>
        <Link to={interviewPath} className={buttonPrimary}>
          Continue interview
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {session.report ? (
          <RecommendationBadge recommendation={session.report.recommendation} />
        ) : (
          <Badge tone="blue">Interview done</Badge>
        )}
        <Link to={interviewPath} className={buttonSecondary}>
          View your answers
        </Link>
      </div>
      {session.report && <p className="text-sm leading-relaxed text-slate-600">{session.report.summary}</p>}
    </div>
  );
}

export default function MyApplicationsPage() {
  useDocumentTitle("My applications");
  const applications = useApiData(listMyApplications, [], "Couldn't load your applications.");

  function renderApplications() {
    if (applications.error) return <ErrorMessage message={applications.error} />;
    if (!applications.data) return <LoadingState />;
    if (applications.data.length === 0) {
      return (
        <EmptyState
          title="You haven't applied to any jobs yet"
          action={
            <Link to="/candidate/jobs" className={buttonPrimary}>
              Browse open positions
            </Link>
          }
        />
      );
    }
    return (
      <ul className="space-y-4">
        {applications.data.map((application) => (
          <li key={application.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/candidate/jobs/${application.jobPosting.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {application.jobPosting.title}
                  </Link>
                  <p className="text-sm text-slate-500">
                    {application.jobPosting.recruiter.companyName} · Applied {formatDate(application.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {application.jobPosting.status === "CLOSED" && <Badge>Job closed</Badge>}
                  <ApplicationStatusBadge status={application.status} forCandidate />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[8rem_1fr]">
                <div>
                  <p className="text-2xl font-semibold text-slate-900">
                    {application.matchScore === null ? "—" : `${application.matchScore}%`}
                  </p>
                  <p className="text-xs text-slate-500">resume match</p>
                </div>
                <SkillGapList gaps={application.skillGaps} />
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <InterviewSection application={application} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <PageHeader
        title="My applications"
        description="Your match scores, skill gaps and interviews for each job."
        actions={
          <Link to="/candidate/jobs" className={buttonSecondary}>
            Browse more jobs
          </Link>
        }
      />
      {renderApplications()}
    </>
  );
}
