import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchAnswerRecording,
  fetchApplicantResume,
  getApplication,
  updateApplicationStatus,
  type ApplicationStatus,
} from "../../api/applicationsApi";
import StatusActions from "../../components/recruiter/StatusActions";
import { buttonSecondary } from "../../components/common/styles";
import {
  ApplicationStatusBadge,
  BackLink,
  Badge,
  Card,
  ErrorMessage,
  InterviewStatusBadge,
  LoadingState,
  MatchScore,
  PageHeader,
  RecommendationBadge,
  SignalList,
  SkillGapList,
} from "../../components/common/ui";
import { toast } from "../../store/toastStore";
import { confirmStatusChange, statusChangeMessage } from "../../utils/applicationStatus";
import { errorMessage } from "../../utils/errors";
import { formatDate, formatDateTime, splitRecommendation } from "../../utils/format";
import { openInNewTab } from "../../utils/openBlob";
import { summarizeSignals } from "../../utils/signals";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

const EVENT_LABELS: Record<string, string> = {
  TAB_SWITCH: "Switched away from the interview tab",
  COPY_PASTE: "Copied or pasted on the page",
  PASTE_BLOCKED_IN_ANSWER: "Tried to paste into the answer box (blocked)",
  SUSPICIOUS_TYPING_SPEED: "Typed an answer unusually fast",
};

function eventDetail(metadata: Record<string, unknown> | null): string {
  const speed = metadata?.charsPerSecond;
  return typeof speed === "number" ? ` (about ${speed} characters per second)` : "";
}

/** Loads a voice answer only when the recruiter asks to play it. */
function RecordingPlayer({ applicationId, answerId }: { applicationId: string; answerId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function handleLoad() {
    setLoading(true);
    setError("");
    try {
      setUrl(URL.createObjectURL(await fetchAnswerRecording(applicationId, answerId)));
    } catch (err) {
      setError(errorMessage(err, "Couldn't load the recording."));
    } finally {
      setLoading(false);
    }
  }

  if (url) return <audio controls autoPlay src={url} className="mt-2 w-full" />;
  return (
    <div className="mt-2">
      <button onClick={handleLoad} disabled={loading} className={buttonSecondary}>
        {loading ? "Loading…" : "Play recording"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ApplicantDetailPage() {
  const { applicationId = "" } = useParams();
  const detail = useApiData(() => getApplication(applicationId), [applicationId], "Couldn't load this application.");
  useDocumentTitle(detail.data ? detail.data.candidate.fullName : "Applicant");
  const [updating, setUpdating] = useState(false);

  if (detail.error) {
    return (
      <>
        <BackLink to="/recruiter/dashboard">Job postings</BackLink>
        <div className="mt-4">
          <ErrorMessage message={detail.error} />
        </div>
      </>
    );
  }
  if (!detail.data) return <LoadingState />;

  const application = detail.data;
  const session = application.interviewSession;
  const reason = session?.report ? splitRecommendation(session.report.recommendation).reason : "";

  async function handleStatus(status: ApplicationStatus) {
    if (!confirmStatusChange(application.candidate.fullName, status)) return;
    setUpdating(true);
    try {
      await updateApplicationStatus(application.id, status);
      detail.setData((prev) => prev && { ...prev, status });
      toast.success(statusChangeMessage(application.candidate.fullName, status));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update the status."));
    } finally {
      setUpdating(false);
    }
  }

  function handleOpenResume() {
    openInNewTab(() => fetchApplicantResume(application.id), application.resume.fileName).catch((err) =>
      toast.error(errorMessage(err, "Couldn't open the resume."))
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink to={`/recruiter/jobs/${application.job.id}/applicants`}>Applicants for {application.job.title}</BackLink>}
        title={application.candidate.fullName}
        description={
          <>
            <a href={`mailto:${application.candidate.email}`} className="hover:underline">
              {application.candidate.email}
            </a>{" "}
            · Applied {formatDate(application.createdAt)}
          </>
        }
        actions={<ApplicationStatusBadge status={application.status} />}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-slate-900">Decision</p>
            <p className="text-sm text-slate-500">Shortlisting or rejecting emails the candidate.</p>
          </div>
          <StatusActions status={application.status} busy={updating} onChange={handleStatus} />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <MatchScore score={application.matchScore} />
          <p className="mb-2 mt-4 text-sm font-medium text-slate-700">Skill gaps</p>
          <SkillGapList gaps={application.skillGaps} />
        </Card>
        <Card>
          <p className="font-medium text-slate-900">Resume</p>
          <p className="mt-1 truncate text-sm text-slate-500">{application.resume.fileName}</p>
          <button onClick={handleOpenResume} className={`${buttonSecondary} mt-4`}>
            Open resume
          </button>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">AI interview</h2>
          <InterviewStatusBadge status={session?.status ?? null} />
        </div>
        {!session ? (
          <p className="mt-2 text-sm text-slate-500">The candidate hasn't started the interview yet.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {session.startedAt && (
              <p className="text-sm text-slate-500">
                Started {formatDateTime(session.startedAt)}
                {session.endedAt && ` · Finished ${formatDateTime(session.endedAt)}`}
              </p>
            )}
            {session.report && (
              <div className="space-y-2">
                <RecommendationBadge recommendation={session.report.recommendation} />
                <p className="text-sm leading-relaxed text-slate-700">{session.report.summary}</p>
                {reason && <p className="text-sm text-slate-500">{reason}</p>}
              </div>
            )}
            <SignalList signals={summarizeSignals(session)} />
          </div>
        )}
      </Card>

      {session && session.questions.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Transcript</h2>
          <ol className="space-y-3">
            {session.questions.map((question) => (
              <li key={question.orderIndex}>
                <Card>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Question {question.orderIndex}</span>
                    <Badge>{question.difficulty}</Badge>
                  </div>
                  <p className="mt-2 font-medium text-slate-900">{question.questionText}</p>
                  {question.answer ? (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {question.answer.score !== null && <Badge tone="blue">Score {question.answer.score}/10</Badge>}
                        {question.answer.aiLikelihoodScore !== null && (
                          <Badge tone={question.answer.aiLikelihoodScore >= 70 ? "amber" : "slate"}>
                            AI-likeness {question.answer.aiLikelihoodScore}%
                          </Badge>
                        )}
                        {question.answer.isVoice && <Badge>Spoken answer</Badge>}
                      </div>
                      <p className="whitespace-pre-line text-sm text-slate-700">{question.answer.answerText}</p>
                      {question.answer.isVoice && (
                        <RecordingPlayer applicationId={application.id} answerId={question.answer.id} />
                      )}
                      {question.answer.feedback && <p className="text-sm text-slate-500">{question.answer.feedback}</p>}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">Not answered yet</p>
                  )}
                </Card>
              </li>
            ))}
          </ol>
        </section>
      )}

      {session && session.proctoringEvents.length > 0 && (
        <Card>
          <h2 className="font-semibold text-slate-900">Activity during the interview</h2>
          <p className="mt-1 text-sm text-slate-500">Recorded automatically. Use these to guide your review, not as proof.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {session.proctoringEvents.map((event, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-slate-700">
                  {EVENT_LABELS[event.eventType] ?? event.eventType}
                  {eventDetail(event.metadata)}
                </span>
                <span className="text-slate-400">{formatDateTime(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
