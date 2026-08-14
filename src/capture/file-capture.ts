const SUPPORTED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export function validateCaptureFile(
  file: { name: string; type: string; size: number },
  maxBytes = 25 * 1024 * 1024,
) {
  if (!file.name || file.size <= 0) return { ok: false as const, reason: "EMPTY_FILE" };
  if (file.size > maxBytes) return { ok: false as const, reason: "FILE_TOO_LARGE" };
  if (!SUPPORTED.has(file.type)) return { ok: false as const, reason: "UNSUPPORTED_TYPE" };
  return { ok: true as const };
}
