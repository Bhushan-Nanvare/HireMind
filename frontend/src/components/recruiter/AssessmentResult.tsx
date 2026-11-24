import { getAssessmentResult } from "../../api/mcqApi";
import { Badge, Card, ErrorMessage, LoadingState } from "../common/ui";
import { plural } from "../../utils/format";
import { useApiData } from "../../utils/useApiData";

function duration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

type Events = NonNullable<NonNullable<Awaited<ReturnType<typeof getAssessmentResult>>["attempt"]>["events"]>;

function signalLines(events: Events): string[] {
  const count = (type: string) => events.filter((event) => event.eventType === type).length;
  const fast = events.find((event) => event.eventType === "ANSWERED_TOO_FAST");
  return [
    count("TAB_SWITCH") > 0 && `${plural(count("TAB_SWITCH"), "tab switch", "tab switches")} away from the assessment`,
    count("COPY_PASTE") > 0 && `${plural(count("COPY_PASTE"), "copy action")} on the page`,
    fast && `Answered unusually fast: about ${String(fast.metadata?.medianSeconds ?? "a few")}s per question, with a high score`,
  ].filter((line): line is string => typeof line === "string");
}

export default function AssessmentResult({ applicationId }: { applicationId: string }) {
  const result = useApiData(() => getAssessmentResult(applicationId), [applicationId], "Couldn't load the assessment result.");

  if (result.error) return <ErrorMessage message={result.error} />;
  if (!result.data) return <LoadingState label="Loading the assessment…" />;

  const { test, attempt } = result.data;
  if (!test) return null;

  if (!attempt) {
    return (
      <Card>
        <h2 className="font-semibold text-slate-900">Assessment</h2>
        <p className="mt-2 text-sm text-slate-500">{test.title}: not started yet.</p>
      </Card>
    );
  }

  if (attempt.status === "IN_PROGRESS") {
    return (
      <Card>
        <h2 className="font-semibold text-slate-900">Assessment</h2>
        <p className="mt-2 text-sm text-slate-500">{test.title}: in progress. Results appear once it is submitted.</p>
      </Card>
    );
  }

  const signals = signalLines(attempt.events);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Assessment: {test.title}</h2>
        <Badge tone={attempt.passed ? "green" : "red"}>{attempt.passed ? "Passed" : "Below the pass mark"}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="text-3xl font-semibold text-slate-900">{attempt.percent}%</p>
        <p className="text-sm text-slate-600">
          {attempt.score} of {attempt.total} correct · pass mark {test.passPercent}%
          {attempt.durationSeconds !== null && ` · took ${duration(attempt.durationSeconds)}`}
        </p>
      </div>

      {attempt.topics.length > 0 && (
        <ul className="mt-4 space-y-2">
          {attempt.topics.map((topic) => (
            <li key={topic.topic} className="text-sm">
              <div className="flex justify-between text-slate-700">
                <span>{topic.topic}</span>
                <span>
                  {topic.correct}/{topic.total}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-200">
                <div className="h-1.5 rounded-full bg-slate-900" style={{ width: `${(topic.correct / topic.total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {signals.length === 0 ? (
          <p className="text-sm text-slate-500">No integrity signals were recorded.</p>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Signals to review, not conclusions</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {signals.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Question by question</summary>
        <ol className="mt-3 space-y-4">
          {attempt.questions.map((question) => (
            <li key={question.number} className="text-sm">
              <p className="font-medium text-slate-900">
                {question.number}. {question.text}{" "}
                <span className={question.isCorrect ? "text-green-700" : "text-red-600"}>
                  {question.isCorrect ? "✓" : "✗"}
                </span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {question.options.map((option, index) => {
                  const right = question.correct.includes(index);
                  const picked = question.selected.includes(index);
                  return (
                    <li key={index} className={right ? "text-green-700" : picked ? "text-red-600" : "text-slate-500"}>
                      {right ? "✓" : picked ? "✗" : "○"} {option}
                      {picked && <span className="ml-1 text-xs">(chosen)</span>}
                    </li>
                  );
                })}
                {question.selected.length === 0 && <li className="text-xs text-slate-400">Not answered</li>}
              </ul>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}
