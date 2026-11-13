import { useEffect, useState } from "react";

function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * A suggested pace, not a cutoff: running over is recorded for the recruiter but never stops the
 * candidate, so a slow connection or a careful thinker is never cut off mid-answer.
 */
export default function Countdown({ limitSeconds, paused = false }: { limitSeconds: number; paused?: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [paused]);

  const remaining = limitSeconds - elapsed;
  const over = remaining < 0;
  const runningLow = !over && remaining <= 30;

  return (
    <span
      className={`tabular-nums text-xs ${over ? "text-amber-700" : runningLow ? "text-amber-600" : "text-slate-500"}`}
      aria-live="off"
    >
      {over ? `${clock(-remaining)} over suggested time` : `${clock(remaining)} left`}
    </span>
  );
}
