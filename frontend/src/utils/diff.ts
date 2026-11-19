export type DiffSegment = { text: string; type: "same" | "added" | "removed" };

/** Word-level diff, so a recruiter can see whether a transcript was corrected or replaced. */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const n = a.length;
  const m = b.length;
  const same = (i: number, j: number) => a[i]!.toLowerCase() === b[j]!.toLowerCase();

  const lengths: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i]![j] = same(i, j) ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const segments: DiffSegment[] = [];
  function push(text: string, type: DiffSegment["type"]) {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.text += ` ${text}`;
    else segments.push({ text, type });
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(i, j)) {
      push(b[j]!, "same");
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      push(a[i]!, "removed");
      i++;
    } else {
      push(b[j]!, "added");
      j++;
    }
  }
  while (i < n) push(a[i++]!, "removed");
  while (j < m) push(b[j++]!, "added");
  return segments;
}
