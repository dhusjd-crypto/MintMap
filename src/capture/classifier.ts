import type { CaptureProposalType, CaptureSourceType } from "@/domain/capture";

export function classifyCapture(input: {
  text?: string;
  sourceType: CaptureSourceType;
  possibleFinancial?: boolean;
}): {
  proposalType: CaptureProposalType;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  requiresConfirmation: boolean;
} {
  if (input.possibleFinancial || ["PDF", "IMAGE", "SCREENSHOT"].includes(input.sourceType)) {
    return {
      proposalType: input.possibleFinancial ? "FINANCIAL_DOCUMENT" : "UNKNOWN",
      confidence: "LOW",
      requiresConfirmation: true,
    };
  }
  const text = input.text?.trim() ?? "";
  if (!text) return { proposalType: "UNKNOWN", confidence: "LOW", requiresConfirmation: true };
  if (/(bekle|bekliyorum|cevap verince)/i.test(text))
    return { proposalType: "WAITING_TASK", confidence: "MEDIUM", requiresConfirmation: true };
  if (
    /(ara|yaz|gönder|kontrol et|hazırla|al|öde|topla|başla|bitir|hatırlat)/i.test(text) ||
    /\b(yarın|bugün|cuma|pazartesi)\b/i.test(text)
  ) {
    return { proposalType: "TASK", confidence: "MEDIUM", requiresConfirmation: false };
  }
  return {
    proposalType: text.length > 240 ? "NOTE" : "UNKNOWN",
    confidence: "LOW",
    requiresConfirmation: true,
  };
}
