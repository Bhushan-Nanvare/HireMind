export interface SignalSummary {
  tabSwitches: number;
  pastes: number;
  blockedPastes: number;
  fastTyping: number;
  /** Average AI-likeness estimate across scored answers, or null if none were scored */
  averageAiLikeness: number | null;
}

/** Counts an interview's anti-cheat signals, for recruiters to review (never to decide on their own). */
export function summarizeSignals(
  session: {
    proctoringEvents: { eventType: string }[];
    questions: { answer: { aiLikelihoodScore: number | null } | null }[];
  } | null
): SignalSummary {
  const events = session?.proctoringEvents ?? [];
  const count = (type: string) => events.filter((event) => event.eventType === type).length;
  const scores = (session?.questions ?? [])
    .map((question) => question.answer?.aiLikelihoodScore)
    .filter((score): score is number => typeof score === "number");

  return {
    tabSwitches: count("TAB_SWITCH"),
    pastes: count("COPY_PASTE"),
    blockedPastes: count("PASTE_BLOCKED_IN_ANSWER"),
    fastTyping: count("SUSPICIOUS_TYPING_SPEED"),
    averageAiLikeness: scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null,
  };
}
