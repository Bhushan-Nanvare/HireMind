import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  getInterviewOverview,
  getTranscript,
  logProctoringEvent,
  startInterview,
  submitAnswer,
  submitAudioAnswer,
  type AnswerResult,
  type InterviewReport,
  type InterviewState,
} from "../../api/interviewsApi";
import { buttonPrimary, inputClass } from "../../components/common/styles";
import {
  BackLink,
  Badge,
  Card,
  ErrorMessage,
  LoadingState,
  PageHeader,
  RecommendationBadge,
} from "../../components/common/ui";
import VoiceRecorder from "../../components/interview/VoiceRecorder";
import { errorMessage } from "../../utils/errors";
import { splitRecommendation } from "../../utils/format";
import { useApiData } from "../../utils/useApiData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import { canRecordVoice } from "../../utils/voice";

type AnswerMode = "type" | "voice";

interface LastResult {
  score: number;
  feedback: string;
}

function FeedbackBox({ result }: { result: LastResult }) {
  return (
    <div className="mb-4 rounded-md border border-slate-200 bg-slate-100 p-3 text-sm">
      <p className="font-medium text-slate-900">Previous answer: {result.score}/10</p>
      <p className="mt-1 text-slate-600">{result.feedback}</p>
    </div>
  );
}

function CompletedInterview({ sessionId, report }: { sessionId: string; report: InterviewReport | null }) {
  const transcript = useApiData(() => getTranscript(sessionId), [sessionId], "Couldn't load your answers.");
  const reason = report ? splitRecommendation(report.recommendation).reason : "";

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-semibold text-slate-900">Interview complete</h2>
        {report ? (
          <div className="mt-3 space-y-2">
            <RecommendationBadge recommendation={report.recommendation} />
            <p className="text-sm leading-relaxed text-slate-700">{report.summary}</p>
            {reason && <p className="text-sm text-slate-500">{reason}</p>}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Your report isn't ready yet. Check back shortly.</p>
        )}
        <p className="mt-4 text-xs text-slate-500">
          The recruiter reviews every application and may contact you about next steps.
        </p>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Your answers</h2>
        {transcript.error ? (
          <ErrorMessage message={transcript.error} />
        ) : !transcript.data ? (
          <LoadingState />
        ) : (
          <ol className="space-y-3">
            {transcript.data.questions.map((question) => (
              <li key={question.id}>
                <Card>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Question {question.orderIndex}</span>
                    <Badge>{question.difficulty}</Badge>
                  </div>
                  <p className="mt-2 font-medium text-slate-900">{question.questionText}</p>
                  {question.answer ? (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      {question.answer.isVoice && <Badge tone="blue">Spoken answer, transcribed</Badge>}
                      <p className="whitespace-pre-line text-sm text-slate-700">{question.answer.answerText}</p>
                      {question.answer.score !== null && (
                        <p className="text-sm font-medium text-slate-900">Score: {question.answer.score}/10</p>
                      )}
                      {question.answer.feedback && <p className="text-sm text-slate-600">{question.answer.feedback}</p>}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">Not answered</p>
                  )}
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default function InterviewPage() {
  const { applicationId = "" } = useParams();
  const overview = useApiData(() => getInterviewOverview(applicationId), [applicationId], "Couldn't load this interview.");
  useDocumentTitle(overview.data ? `Interview: ${overview.data.jobTitle}` : "Interview");

  const [voiceSupported] = useState(canRecordVoice);
  const [consented, setConsented] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [mode, setMode] = useState<AnswerMode>("type");
  const [answerText, setAnswerText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  // Set when each question appears (see the effect below)
  const questionShownAt = useRef(0);

  const interview = overview.data?.interview ?? null;
  const sessionId = interview?.session.id ?? null;
  const question = interview && !interview.done ? interview.question : null;
  const questionId = question?.id ?? null;

  // Time each question from when it appears (unrealistically fast typing is flagged for review)
  useEffect(() => {
    questionShownAt.current = Date.now();
  }, [questionId]);

  // Proctoring: log tab switches and copy/paste while a question is on screen
  useEffect(() => {
    if (!sessionId || !questionId) return;
    const id = sessionId;

    function handleVisibilityChange() {
      if (document.hidden) logProctoringEvent(id, "TAB_SWITCH");
    }
    function handleCopyPaste() {
      logProctoringEvent(id, "COPY_PASTE");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("copy", handleCopyPaste);
    document.addEventListener("paste", handleCopyPaste);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", handleCopyPaste);
      document.removeEventListener("paste", handleCopyPaste);
    };
  }, [sessionId, questionId]);

  function showState(state: InterviewState) {
    overview.setData((prev) => prev && { ...prev, interview: state });
  }

  // Starts the interview, or retries preparing the next step after a failure
  async function handleStart() {
    setStarting(true);
    setStartError("");
    try {
      showState(await startInterview(applicationId));
    } catch (err) {
      setStartError(errorMessage(err, "Couldn't prepare the interview. Please try again."));
    } finally {
      setStarting(false);
    }
  }

  async function submit(send: () => Promise<AnswerResult>) {
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await send();
      setLastResult({ score: result.score, feedback: result.feedback });
      setAnswerText("");
      showState(result);
    } catch (err) {
      // Nothing was saved, so the typed answer or recording is still there for another try
      setSubmitError(errorMessage(err, "Couldn't submit your answer. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTypedSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sessionId || !question) return;
    const timeTakenSeconds = Math.max(1, (Date.now() - questionShownAt.current) / 1000);
    await submit(() => submitAnswer(sessionId, question.id, answerText, timeTakenSeconds));
  }

  async function handleVoiceSubmit(recording: Blob, fileName: string) {
    if (!sessionId || !question) return;
    await submit(() => submitAudioAnswer(sessionId, question.id, recording, fileName));
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
  if (!overview.data) return <LoadingState label="Loading your interview…" />;

  const header = (
    <PageHeader back={back} title={overview.data.jobTitle} description={`AI interview · ${overview.data.companyName}`} />
  );

  if (!interview) {
    return (
      <div className="max-w-2xl">
        {header}
        <Card>
          <h2 className="font-semibold text-slate-900">Before you start</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
            <li>There are 5 questions about this role and your resume. Each one adapts to how you answered the last.</li>
            <li>
              Answer by typing{voiceSupported ? " or by recording your voice" : ""}. There's no time limit, and you can
              leave and come back later.
            </li>
            <li>You'll get a score and short feedback after each answer. Pasting into the answer box is disabled.</li>
            <li>
              To keep interviews fair, switching tabs, copying or pasting, and unusually fast typing are recorded. The
              recruiter sees them as signals to review, not as automatic decisions.
            </li>
          </ul>
          <label className="mt-5 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>I understand how the interview works and agree to this activity being recorded.</span>
          </label>
          <div className="mt-3">
            <ErrorMessage message={startError} />
          </div>
          <button onClick={handleStart} disabled={!consented || starting} className={`${buttonPrimary} mt-4`}>
            {starting ? "Preparing your first question…" : "Start interview"}
          </button>
        </Card>
      </div>
    );
  }

  if (interview.done) {
    return (
      <div className="max-w-2xl">
        {header}
        <CompletedInterview sessionId={interview.session.id} report={interview.report} />
      </div>
    );
  }

  // The last answer was saved, but the next question (or the report) couldn't be prepared
  if (!question) {
    return (
      <div className="max-w-2xl">
        {header}
        {lastResult && <FeedbackBox result={lastResult} />}
        <Card>
          <p className="text-sm text-slate-700">Your last answer was saved, but the next step couldn't be prepared.</p>
          <div className="mt-3">
            <ErrorMessage message={startError} />
          </div>
          <button onClick={handleStart} disabled={starting} className={`${buttonPrimary} mt-3`}>
            {starting ? "Trying again…" : "Try again"}
          </button>
        </Card>
      </div>
    );
  }

  const progress = Math.round(((question.orderIndex - 1) / interview.totalQuestions) * 100);
  const activeSessionId = interview.session.id;

  return (
    <div className="max-w-2xl">
      {header}

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Question {question.orderIndex} of {interview.totalQuestions}
          </span>
          <Badge>{question.difficulty}</Badge>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-200">
          <div className="h-1.5 rounded-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {lastResult && <FeedbackBox result={lastResult} />}

      <Card className="mb-4">
        <p className="leading-relaxed text-slate-900">{question.questionText}</p>
      </Card>

      {voiceSupported && (
        <div className="mb-3 inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="How to answer">
          {(["type", "voice"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              disabled={submitting}
              className={`rounded px-3 py-1.5 ${mode === option ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {option === "type" ? "Type" : "Speak"}
            </button>
          ))}
        </div>
      )}

      {mode === "voice" && voiceSupported ? (
        <VoiceRecorder key={question.id} submitting={submitting} onSubmit={handleVoiceSubmit} />
      ) : (
        <form onSubmit={handleTypedSubmit} className="space-y-3">
          <label htmlFor="answer" className="sr-only">
            Your answer
          </label>
          <textarea
            id="answer"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              logProctoringEvent(activeSessionId, "PASTE_BLOCKED_IN_ANSWER");
            }}
            placeholder="Type your answer…"
            rows={7}
            maxLength={5000}
            className={inputClass}
            required
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">Pasting is disabled.</p>
            <button type="submit" disabled={submitting || !answerText.trim()} className={buttonPrimary}>
              {submitting ? "Scoring your answer…" : "Submit answer"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-3">
        <ErrorMessage message={submitError} />
      </div>
    </div>
  );
}
