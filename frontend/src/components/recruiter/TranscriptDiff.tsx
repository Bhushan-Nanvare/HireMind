import { useMemo, useState } from "react";
import type { AnswerVoiceMetrics } from "../../api/applicationsApi";
import { diffWords } from "../../utils/diff";

function describe(metrics: AnswerVoiceMetrics | null): string[] {
  if (!metrics) return [];
  const lines: string[] = [];

  if (typeof metrics.latencyMs === "number") {
    lines.push(`Started speaking ${(metrics.latencyMs / 1000).toFixed(1)}s after the question`);
  }
  if (metrics.speakingMs && metrics.wordCount) {
    const wordsPerMinute = Math.round(metrics.wordCount / (metrics.speakingMs / 60000));
    lines.push(`${wordsPerMinute} words per minute over ${Math.round(metrics.speakingMs / 1000)}s`);
  }
  if (metrics.longPauses) lines.push(`${metrics.longPauses} long pause${metrics.longPauses === 1 ? "" : "s"}`);
  return lines;
}

export default function TranscriptDiff({
  rawTranscript,
  answerText,
  metrics,
}: {
  rawTranscript: string;
  answerText: string;
  metrics: AnswerVoiceMetrics | null;
}) {
  const [open, setOpen] = useState(false);
  const segments = useMemo(() => diffWords(rawTranscript, answerText), [rawTranscript, answerText]);
  const changed = segments.some((segment) => segment.type !== "same");
  const facts = describe(metrics);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="font-medium text-slate-700 underline"
        aria-expanded={open}
      >
        {changed ? "Edited after speaking — compare" : "Submitted exactly as spoken"}
      </button>

      {facts.length > 0 && <p className="mt-1 text-slate-500">{facts.join(" · ")}</p>}

      {open && (
        <p className="mt-2 leading-relaxed">
          {segments.map((segment, index) => (
            <span
              key={index}
              className={
                segment.type === "removed"
                  ? "bg-red-100 text-red-800 line-through"
                  : segment.type === "added"
                    ? "bg-green-100 text-green-800"
                    : "text-slate-600"
              }
            >
              {segment.text}{" "}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
