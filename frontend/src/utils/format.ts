const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(value: string | Date): string {
  return dateFormat.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(new Date(value));
}

/** "1 applicant", "3 applicants" */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Interview reports store "<verdict> — <reason>". Reports from before that format have no reason. */
export function splitRecommendation(recommendation: string): { verdict: string; reason: string } {
  const [verdict = recommendation, ...rest] = recommendation.split(" — ");
  return { verdict: verdict.trim(), reason: rest.join(" — ").trim() };
}
