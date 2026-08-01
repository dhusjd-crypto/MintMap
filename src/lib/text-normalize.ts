/**
 * Repairs strings that were saved after an accidental UTF-8-as-Latin-1
 * conversion. The repair is intentionally conservative: valid Turkish text
 * is returned unchanged unless the decoded candidate has fewer mojibake
 * markers and contains no replacement character.
 */
function mojibakeScore(value: string) {
  return (value.match(/[\u00c2\u00c3\u00c4\u00c5\u00e2\u0192\ufffd]/g) ?? []).length;
}

function decodeCandidate(value: string) {
  const bytes = Uint8Array.from([...value], (char) => char.codePointAt(0)! & 0xff);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function repairMojibake(value: string): string {
  let current = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const score = mojibakeScore(current);
    if (score === 0) break;
    const candidate = decodeCandidate(current);
    if (candidate.includes("\ufffd") || mojibakeScore(candidate) >= score) break;
    current = candidate;
  }
  return current;
}

/** Repairs text at every level of a persisted JSON-like object. */
export function repairTextTree<T>(value: T): T {
  if (typeof value === "string") return repairMojibake(value) as T;
  if (Array.isArray(value)) return value.map((item) => repairTextTree(item)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, repairTextTree(item)]),
  ) as T;
}
