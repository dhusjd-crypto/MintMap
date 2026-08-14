import { parseMoneyInput } from "./money-input";

export type ExtractedDocumentMethod = "EMBEDDED_PDF_TEXT" | "OCR_IMAGE" | "OCR_PDF" | "MANUAL_TEXT";
export type ExtractedDocumentText = {
  documentId: string;
  method: ExtractedDocumentMethod;
  pages: string[];
  text: string;
  warnings: string[];
  extractorVersion: string;
};

export type StatementTextCandidate = {
  value: string | number | { minorUnits: number; currency: "TRY" | "USD" | "EUR" };
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  reason: "EXPLICIT_LABEL_MATCH" | "NEAR_LABEL_VALUE" | "AMBIGUOUS_MULTIPLE_VALUES";
};

export type StatementTextInterpretation = {
  fields: Record<string, StatementTextCandidate>;
  warnings: string[];
};

const MONEY = /(?:(?:TRY|TL|₺)\s*)?([+-]?[\d.]+(?:,[0-9]{1,2})?)(?:\s*(TRY|TL|₺|USD|\$|EUR|€))?/i;
const DATE = /(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/;
const labels: Record<string, RegExp> = {
  statementDate: /(?:ekstre|hesap kesim|statement)\s*tarihi[^\n:]*[:\-]?\s*/i,
  dueDate: /(?:son ödeme|due date)\s*tarihi?[^\n:]*[:\-]?\s*/i,
  newBalance: /(?:dönem borcu|toplam borç|new balance|statement balance)[^\n:]*[:\-]?\s*/i,
  minimumPayment: /(?:asgari ödeme(?: tutarı)?|minimum payment)[^\n:]*[:\-]?\s*/i,
  previousBalance: /(?:önceki bakiye|previous balance)[^\n:]*[:\-]?\s*/i,
  interest: /(?:faiz|interest)[^\n:]*[:\-]?\s*/i,
  fees: /(?:ücret|masraf|fees?)[^\n:]*[:\-]?\s*/i,
};

function currencyFor(symbol?: string): "TRY" | "USD" | "EUR" | undefined {
  if (!symbol) return undefined;
  if (/^(TRY|TL|₺)$/i.test(symbol)) return "TRY";
  if (/^(USD|\$)$/i.test(symbol)) return "USD";
  if (/^(EUR|€)$/i.test(symbol)) return "EUR";
  return undefined;
}

function dateValue(value: string) {
  const iso = value.match(/^\d{4}-\d{2}-\d{2}$/)
    ? value
    : (() => {
        const [day, month, year] = value.split(/[./]/);
        return `${year}-${month}-${day}`;
      })();
  return Date.parse(`${iso}T12:00:00Z`);
}

function findAfterLabel(text: string, label: RegExp, kind: "date" | "money") {
  const candidates: string[] = [];
  for (const match of text.matchAll(
    new RegExp(label.source + (kind === "date" ? DATE.source : MONEY.source), "gi"),
  )) {
    candidates.push(match[0]);
  }
  return candidates;
}

/** Deterministic, label-first interpreter. It returns candidates, never financial truth. */
export function interpretStatementText(text: string): StatementTextInterpretation {
  const fields: Record<string, StatementTextCandidate> = {};
  const warnings: string[] = [];
  for (const [field, label] of Object.entries(labels)) {
    const dateField = field === "statementDate" || field === "dueDate";
    const candidates = findAfterLabel(text, label, dateField ? "date" : "money");
    if (candidates.length === 0) continue;
    if (candidates.length > 1) {
      warnings.push(`MULTIPLE_${field.toUpperCase()}_CANDIDATES`);
      continue;
    }
    const candidate = candidates[0];
    if (dateField) {
      const value = candidate.match(DATE)?.[1];
      if (value)
        fields[field] = {
          value: dateValue(value),
          confidence: "HIGH",
          reason: "EXPLICIT_LABEL_MATCH",
        };
      continue;
    }
    const money = candidate.match(MONEY);
    const value = money?.[1];
    const currency =
      currencyFor(money?.[2]) ?? (/(?:TL|₺|TRY)/i.test(candidate) ? "TRY" : undefined);
    if (!value || !currency) {
      warnings.push(`CURRENCY_UNKNOWN_${field.toUpperCase()}`);
      continue;
    }
    try {
      fields[field] = {
        value: parseMoneyInput(value.replace(/^\+/, ""), currency),
        confidence: "HIGH",
        reason: "EXPLICIT_LABEL_MATCH",
      };
    } catch {
      warnings.push(`INVALID_${field.toUpperCase()}`);
    }
  }
  return { fields, warnings };
}

export function imageOcrCapability() {
  return {
    supported: false,
    reason: "OCR_UNAVAILABLE_NO_LOCAL_ENGINE",
    languages: [] as string[],
  };
}

export async function extractPdfEmbeddedText(
  documentId: string,
  bytes: ArrayBuffer,
  limits = { maxPages: 20, maxBytes: 12 * 1024 * 1024 },
): Promise<ExtractedDocumentText> {
  if (bytes.byteLength > limits.maxBytes)
    return {
      documentId,
      method: "EMBEDDED_PDF_TEXT",
      pages: [],
      text: "",
      warnings: ["EXTRACTION_LIMIT_EXCEEDED"],
      extractorVersion: "PDF_TEXT_V1",
    };
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument(input: { data: Uint8Array }): {
      promise: Promise<{
        numPages: number;
        getPage(
          page: number,
        ): Promise<{ getTextContent(): Promise<{ items: { str?: string }[] }> }>;
      }>;
    };
  };
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  if (pdf.numPages > limits.maxPages)
    return {
      documentId,
      method: "EMBEDDED_PDF_TEXT",
      pages: [],
      text: "",
      warnings: ["EXTRACTION_LIMIT_EXCEEDED"],
      extractorVersion: "PDF_TEXT_V1",
    };
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => item.str ?? "").join(" ");
    }),
  );
  return {
    documentId,
    method: "EMBEDDED_PDF_TEXT",
    pages,
    text: pages.join("\n"),
    warnings: pages.join("").trim()
      ? []
      : ["PDF_EMBEDDED_TEXT_INADEQUATE", "OCR_UNAVAILABLE_NO_LOCAL_ENGINE"],
    extractorVersion: "PDF_TEXT_V1",
  };
}
