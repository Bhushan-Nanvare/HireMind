import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { startInterview, submitAnswer, getSession } from "../../api/interviewsApi";
import Navbar from "../../components/common/Navbar";
import api from "../../api/axiosClient";

interface Question { id: string; questionText: string; difficulty: string; }
interface LastResult { score: number; feedback: string; }
interface Report { summary: string; recommendation: string; }

export default function InterviewPage() {
  const { applicationId } = useParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [answerText, setAnswerText] = useState("");
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const hasStarted = useRef(false);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      begin();
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    function logEvent(eventType: "TAB_SWITCH" | "COPY_PASTE") {
      api.post(`/interviews/${sessionId}/proctoring`, { eventType }).catch(() => { });
    }

    function handleVisibilityChange() {
      if (document.hidden) logEvent("TAB_SWITCH");
    }
    function handleCopyPaste() {
      logEvent("COPY_PASTE");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("copy", handleCopyPaste);
    document.addEventListener("paste", handleCopyPaste);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", handleCopyPaste);
      document.removeEventListener("paste", handleCopyPaste);
    };
  }, [sessionId]);

  async function begin() {
    try {
      const result = await startInterview(applicationId!);
      setSessionId(result.session.id);
      setQuestion(result.question);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to start interview");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !question) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await submitAnswer(sessionId, question.id, answerText);
      setLastResult({ score: result.score, feedback: result.feedback });
      setAnswerText("");

      if (result.done) {
        setDone(true);
        const sessionData = await getSession(sessionId);
        setReport(sessionData.report);
      } else {
        setQuestion(result.nextQuestion);
        setQuestionNumber((n) => n + 1);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="max-w-xl mx-auto p-8"><p className="text-red-600 text-sm">{error}</p></div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="max-w-xl mx-auto p-8">
          <h1 className="text-2xl font-semibold text-slate-900 mb-4">Interview complete</h1>
          {!report && <p className="text-sm text-slate-500">Generating your report...</p>}
          {report && (
            <div className="bg-white p-5 rounded border space-y-3">
              <p className="text-sm text-slate-700">{report.summary}</p>
              <p className="text-sm font-medium text-slate-900">Recommendation: {report.recommendation}</p>
            </div>
          )}
          <a href="/candidate/dashboard" className="inline-block mt-6 text-sm text-slate-600 underline">Back to dashboard</a>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="max-w-xl mx-auto p-8"><p className="text-sm text-slate-500">Starting interview...</p></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-xl mx-auto p-8">
        <p className="text-xs text-slate-400 mb-2">Question {questionNumber} of 5 · {question.difficulty}</p>

        {lastResult && (
          <div className="bg-slate-100 p-3 rounded mb-4 text-sm">
            <p className="font-medium text-slate-900">Previous score: {lastResult.score}/10</p>
            <p className="text-slate-600 mt-1">{lastResult.feedback}</p>
          </div>
        )}

        <div className="bg-white p-5 rounded border mb-4"><p className="text-slate-900">{question.questionText}</p></div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Type your answer..." className="w-full border rounded px-3 py-2 text-sm h-32" required />
          <button type="submit" disabled={submitting} className="bg-slate-900 text-white text-sm px-4 py-2 rounded">
            {submitting ? "Evaluating..." : "Submit answer"}
          </button>
        </form>
      </div>
    </div>
  );
}