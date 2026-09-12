import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { plural, splitRecommendation } from "../../utils/format";
import type { SignalSummary } from "../../utils/signals";

type Tone = "slate" | "green" | "amber" | "red" | "blue";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-blue-50 text-blue-700",
};

export function Badge({ tone = "slate", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && <div className="mb-3">{back}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm text-slate-500 hover:text-slate-900">
      ← {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>{children}</div>;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="py-10 text-center text-sm text-slate-400" role="status">
      {label}
    </p>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}

export function ApplicationStatusBadge({ status, forCandidate = false }: { status: string; forCandidate?: boolean }) {
  if (status === "SHORTLISTED") return <Badge tone="green">Shortlisted</Badge>;
  if (status === "REJECTED") return <Badge tone="red">{forCandidate ? "Not selected" : "Rejected"}</Badge>;
  return <Badge>Applied</Badge>;
}

export function JobStatusBadge({ status }: { status: string }) {
  return status === "OPEN" ? <Badge tone="green">Open</Badge> : <Badge>Closed</Badge>;
}

export function InterviewStatusBadge({ status }: { status: string | null }) {
  if (status === "COMPLETED") return <Badge tone="blue">Interview done</Badge>;
  if (status === "IN_PROGRESS") return <Badge tone="amber">Interview in progress</Badge>;
  return <Badge>Interview not started</Badge>;
}

/** The verdict from an interview report, coloured by how positive it is. Hover shows the full text. */
export function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const { verdict } = splitRecommendation(recommendation);
  const lower = verdict.toLowerCase();
  const tone: Tone =
    lower.startsWith("strongly recommend") || lower.startsWith("recommend")
      ? "green"
      : lower.startsWith("consider")
        ? "amber"
        : "red";
  return (
    <Badge tone={tone} title={recommendation}>
      {verdict}
    </Badge>
  );
}

const IMPORTANCE_DOT: Record<string, string> = { high: "bg-red-400", medium: "bg-amber-400", low: "bg-slate-300" };

export function SkillGapList({ gaps }: { gaps: { missingSkill: string; importance: string }[] }) {
  if (gaps.length === 0) return <p className="text-sm text-slate-500">No significant skill gaps found.</p>;
  return (
    <ul className="space-y-1.5">
      {gaps.map((gap, i) => (
        <li key={`${gap.missingSkill}-${i}`} className="flex items-center gap-2 text-sm text-slate-700">
          <span className={`h-2 w-2 shrink-0 rounded-full ${IMPORTANCE_DOT[gap.importance] ?? "bg-slate-300"}`} aria-hidden />
          <span>{gap.missingSkill}</span>
          <span className="text-xs text-slate-400">{gap.importance}</span>
        </li>
      ))}
    </ul>
  );
}

export function MatchScore({ score }: { score: number | null }) {
  return (
    <div>
      <p className="text-3xl font-semibold text-slate-900">{score === null ? "—" : `${score}%`}</p>
      <p className="text-xs text-slate-500">resume match</p>
    </div>
  );
}

/** Anti-cheat signals, framed as things to review rather than conclusions. */
export function SignalList({ signals }: { signals: SignalSummary }) {
  const lines = [
    signals.tabSwitches > 0 && `${plural(signals.tabSwitches, "tab switch", "tab switches")} away from the interview`,
    signals.pastes > 0 && `${plural(signals.pastes, "copy or paste", "copies or pastes")} on the page`,
    signals.blockedPastes > 0 && `${plural(signals.blockedPastes, "blocked paste")} into the answer box`,
    signals.fastTyping > 0 && `${plural(signals.fastTyping, "answer")} typed unusually fast`,
    signals.averageAiLikeness !== null && `Average AI-likeness estimate: ${signals.averageAiLikeness}%`,
  ].filter((line): line is string => typeof line === "string");

  if (lines.length === 0) return <p className="text-sm text-slate-500">No integrity signals were recorded.</p>;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">Signals to review, not conclusions</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
