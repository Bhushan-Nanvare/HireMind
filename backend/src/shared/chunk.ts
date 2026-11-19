const MAX_CHUNK_CHARS = 600;
const MAX_CHUNKS = 40;

/** Splits resume text into sections small enough that a match points at something specific. */
export function splitIntoChunks(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    if (current && current.length + line.length + 1 > maxChars) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);

  return chunks.slice(0, MAX_CHUNKS);
}
