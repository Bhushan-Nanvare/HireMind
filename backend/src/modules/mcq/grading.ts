import { randomInt } from "crypto";

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** Exactly the right options, no more and no fewer. */
export function sameSet(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && b.every((value) => a.includes(value));
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function percentOf(score: number, total: number): number {
  return total === 0 ? 0 : Math.round((score / total) * 100);
}
