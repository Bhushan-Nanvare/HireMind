import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getAssessmentOverview,
  logAssessmentEvent,
  saveAnswer,
  startAssessment,
  submitAssessment,
  type AttemptView,
  type PaperQuestion,
} from "../../api/mcqApi";
import { buttonPrimary, buttonSecondary } from "../../components/common/styles";
import { BackLink, Badge, Card, EmptyState, ErrorMessage, LoadingState, PageHeader } from "../../components/common/ui";
import { errorMessage } from "../../utils/errors";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function Result({ attempt }: { attempt: AttemptView }) {
  const result = attempt.result;
  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Assessment submitted</h2>
      {result ? (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <p className="text-4xl font-semibold text-slate-900">{result.percent}%</p>
          <div className="space-y-1">
            <Badge tone={result.passed ? "green" : "red"}>{result.passed ? "Passed" : "Below the pass mark"}</Badge>
            <p className="text-sm text-slate-600">
              {result.score} of {result.total} correct
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">Your answers are in. The recruiter will review the result.</p>
      )}
      <p className="mt-4 text-xs text-slate-500">You can take this assessment once, so there's nothing more to do here.</p>
    </Card>
  );
}

function Runner({ attempt, onFinished }: { attempt: AttemptView; onFinished: (view: AttemptView) => void }) {
  const { questions } = attempt;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(questions.map((question) => [question.id, question.selected]))
  );
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(attempt.secondsLeft);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const pending = useRef(new Map<string, number[]>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const finished = useRef(false);
  const finishRef = useRef<(auto: boolean) => void>(() => {});

  useEffect(() => {
    const endsAt = Date.now() + attempt.secondsLeft * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        finishRef.current(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [attempt.secondsLeft]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) logAssessmentEvent(attempt.id, "TAB_SWITCH");
    };
    const onCopy = () => logAssessmentEvent(attempt.id, "COPY_PASTE");
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("copy", onCopy);
    };
  }, [attempt.id]);

  function persist(questionId: string, selected: number[]) {
    pending.current.set(questionId, selected);
    queue.current = queue.current.then(async () => {
      try {
        await saveAnswer(attempt.id, questionId, selected);
        if (pending.current.get(questionId) === selected) pending.current.delete(questionId);
        setError("");
      } catch (err) {
        setError(errorMessage(err, "Your last answer couldn't be saved. Check your connection."));
      }
    });
  }

  function choose(question: PaperQuestion, position: number) {
    const current = answers[question.id] ?? [];
    const next = question.multiple
      ? current.includes(position)
        ? current.filter((value) => value !== position)
        : [...current, position]
      : [position];
    setAnswers((previous) => ({ ...previous, [question.id]: next }));
    persist(question.id, next);
  }

  async function finish(auto: boolean) {
    if (finished.current) return;
    finished.current = true;
    setSubmitting(true);
    setError("");
    try {
      await queue.current;
      try {
        for (const [questionId, selected] of pending.current) await saveAnswer(attempt.id, questionId, selected);
        pending.current.clear();
      } catch (err) {
        // When time is up the server grades what it already has, so don't block on a failed resend
        if (!auto) throw err;
      }
      onFinished(await submitAssessment(attempt.id));
    } catch (err) {
      finished.current = false;
      setSubmitting(false);
      setError(errorMessage(err, "Couldn't submit your answers. Please try again."));
    }
  }

  useEffect(() => {
    finishRef.current = (auto) => void finish(auto);
  });

  const question = questions[index] as PaperQuestion;
  const answered = questions.filter((candidate) => (answers[candidate.id] ?? []).length > 0).length;
  const low = secondsLeft <= 60;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Question {index + 1} of {questions.length} · {answered} answered
        </p>
        <p className={`tabular-nums text-lg font-semibold ${low ? "text-red-600" : "text-slate-900"}`} aria-label="Time left">
          {clock(secondsLeft)}
        </p>
      </div>

      <Card>
        <p className="leading-relaxed text-slate-900">{question.text}</p>
        {question.multiple && <p className="mt-1 text-xs text-slate-500">Select all that apply.</p>}
        <div className="mt-4 space-y-2" role={question.multiple ? "group" : "radiogroup"} aria-label="Answer options">
          {question.options.map((option, position) => {
            const checked = (answers[question.id] ?? []).includes(position);
            return (
              <label
                key={position}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
                  checked ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-400"
                }`}
              >
                <input
                  type={question.multiple ? "checkbox" : "radio"}
                  name={`question-${question.id}`}
                  checked={checked}
                  onChange={() => choose(question, position)}
                  disabled={submitting}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-slate-800">{option}</span>
              </label>
            );
          })}
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setIndex(index - 1)} disabled={index === 0} className={buttonSecondary}>
            Previous
          </button>
          <button
            type="button"
            onClick={() => setIndex(index + 1)}
            disabled={index === questions.length - 1}
            className={buttonSecondary}
          >
            Next
          </button>
        </div>
        <button
          type="button"
          aria-pressed={flagged.has(question.id)}
          onClick={() =>
            setFlagged((previous) => {
              const next = new Set(previous);
              if (!next.delete(question.id)) next.add(question.id);
              return next;
            })
          }
          className={buttonSecondary}
        >
          {flagged.has(question.id) ? "Unflag" : "Flag for review"}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Questions">
        {questions.map((candidate, position) => {
          const done = (answers[candidate.id] ?? []).length > 0;
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setIndex(position)}
              aria-label={`Question ${position + 1}${done ? ", answered" : ""}${flagged.has(candidate.id) ? ", flagged" : ""}`}
              aria-current={position === index}
              className={`h-9 w-9 rounded-md border text-sm font-medium ${
                position === index ? "ring-2 ring-slate-900 ring-offset-1" : ""
              } ${flagged.has(candidate.id) ? "border-amber-400 bg-amber-50 text-amber-800" : done ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {position + 1}
            </button>
          );
        })}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <ErrorMessage message={error} />
        {confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-700">
              {answered < questions.length
                ? `You've answered ${answered} of ${questions.length}. Submit anyway?`
                : "Submit your answers? You can't change them afterwards."}
            </p>
            <button type="button" onClick={() => void finish(false)} disabled={submitting} className={buttonPrimary}>
              {submitting ? "Submitting…" : "Yes, submit"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={submitting} className={buttonSecondary}>
              Keep working
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={buttonPrimary}>
            Submit assessment
          </button>
        )}
      </div>
    </div>
  );
}

export default function AssessmentPage() {
  const { applicationId = "" } = useParams();
  const overview = useApiData(() => getAssessmentOverview(applicationId), [applicationId], "Couldn't load this assessment.");
  useDocumentTitle(overview.data ? `Assessment: ${overview.data.jobTitle}` : "Assessment");

  const [consented, setConsented] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [running, setRunning] = useState<AttemptView | null>(null);
  const [finishedView, setFinishedView] = useState<AttemptView | null>(null);

  async function handleStart() {
    setStarting(true);
    setStartError("");
    try {
      setRunning(await startAssessment(applicationId));
    } catch (err) {
      setStartError(errorMessage(err, "Couldn't start the assessment. Please try again."));
      overview.reload();
    } finally {
      setStarting(false);
    }
  }

  const back = <BackLink to="/candidate/applications">My applications</BackLink>;

  if (overview.error) {
    return (
      <>
        {back}
        <div className="mt-4">
          <ErrorMessage message={overview.error} />
        </div>
      </>
    );
  }
  if (!overview.data) return <LoadingState label="Loading your assessment…" />;

  const { test, attempt, jobTitle, companyName } = overview.data;
  const header = <PageHeader back={back} title={jobTitle} description={`Assessment · ${companyName}`} />;

  if (finishedView || attempt?.status === "SUBMITTED") {
    return (
      <div className="max-w-2xl">
        {header}
        <Result attempt={(finishedView ?? attempt) as AttemptView} />
      </div>
    );
  }

  if (running) {
    return (
      <>
        {header}
        <Runner key={running.id} attempt={running} onFinished={setFinishedView} />
      </>
    );
  }

  if (!test) {
    return (
      <div className="max-w-2xl">
        {header}
        <EmptyState title="No assessment for this job" description="The recruiter hasn't set one up, or it isn't open yet." />
      </div>
    );
  }

  const inProgress = attempt?.status === "IN_PROGRESS";
  return (
    <div className="max-w-2xl">
      {header}
      <Card>
        <h2 className="font-semibold text-slate-900">{test.title}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
          <li>
            {test.questionCount} multiple-choice questions in {test.durationMinutes} minutes. The pass mark is{" "}
            {test.passPercent}%.
          </li>
          <li>
            The clock runs on the server from the moment you start, even if you close the page. Your answers save as
            you go, and anything unanswered when time runs out is marked wrong.
          </li>
          <li>You can go back to earlier questions and flag any you want to revisit. There's one attempt only.</li>
          <li>
            To keep it fair, switching tabs and copying text are recorded and shown to the recruiter as signals to
            review, not as automatic decisions.
          </li>
        </ul>
        {inProgress ? (
          <p className="mt-4 text-sm text-slate-700">You've already started. Continue where you left off.</p>
        ) : (
          <label className="mt-5 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>I understand how the assessment works and agree to this activity being recorded.</span>
          </label>
        )}
        <div className="mt-3">
          <ErrorMessage message={startError} />
        </div>
        <button
          type="button"
          onClick={handleStart}
          disabled={starting || (!inProgress && !consented)}
          className={`${buttonPrimary} mt-4`}
        >
          {starting ? "Starting…" : inProgress ? "Continue assessment" : "Start assessment"}
        </button>
      </Card>
    </div>
  );
}
