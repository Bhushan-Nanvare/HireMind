/** Words only, lowercased: punctuation and spacing differ constantly between recognisers. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/**
 * How much two texts share, 0 to 1, comparing words as a multiset.
 *
 * Used to tell a candidate correcting what speech recognition misheard (small changes, ~0.9+)
 * from one replacing the answer wholesale (~0.2 or less). Word order is ignored on purpose:
 * rephrasing is normal, substituting different words is not.
 */
export function wordSimilarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.length === 0 && right.length === 0) return 1;
  if (left.length === 0 || right.length === 0) return 0;

  const remaining = new Map<string, number>();
  for (const word of left) remaining.set(word, (remaining.get(word) ?? 0) + 1);

  let shared = 0;
  for (const word of right) {
    const count = remaining.get(word);
    if (count) {
      shared += 1;
      remaining.set(word, count - 1);
    }
  }
  return shared / Math.max(left.length, right.length);
}
