import { percentOf } from "./grading";

export type AssessmentSummary = {
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
  percent: number | null;
  passed: boolean | null;
};

export function summarizeAssessment(
  test: { passPercent: number } | null,
  attempt: { score: number | null; total: number | null; submittedAt: Date | null } | null
): AssessmentSummary | null {
  if (!test) return null;
  if (!attempt) return { status: "NOT_STARTED", percent: null, passed: null };
  if (!attempt.submittedAt || attempt.score === null || attempt.total === null) {
    return { status: "IN_PROGRESS", percent: null, passed: null };
  }
  const percent = percentOf(attempt.score, attempt.total);
  return { status: "SUBMITTED", percent, passed: percent >= test.passPercent };
}
