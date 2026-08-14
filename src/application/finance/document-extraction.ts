import { parseMoneyInput } from "./money-input";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export type ExtractedDocumentMethod = "EMBEDDED_PDF_TEXT" | "OCR_IMAGE" | "OCR_PDF" | "MANUAL_TEXT";
export type ExtractedDocumentText = {
  documentId: string;
  method: ExtractedDocumentMethod;
  pages: string[];
  text: string;
  warnings: string[];
  extractorVersion: string;
  createdAt: number;
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

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(input: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(page: number): Promise<{
        getTextContent?: () => Promise<{ items: { str?: string }[] }>;
        getViewport?: (input: { scale: number }) => { width: number; height: number };
        render?: (input: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
          promise: Promise<void>;
        };
      }>;
    }>;
  };
};

async function loadPdfJs() {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfjs;
}

const MONEY = /(?:(?:TRY|TL|₺)\s*)?([+-]?[\d.]+(?:,[0-9]{1,2})?)(?:\s*(TRY|TL|₺|USD|\$|EUR|€))?/i;
const DATE = /(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})/;
const labels: Record<string, RegExp> = {
  statementDate: /(?:ekstre tarihi|hesap kesim tarihi|statement date)[^\n:]*[:-]?\s*/i,
  dueDate: /(?:son ödeme tarihi|due date)[^\n:]*[:-]?\s*/i,
  newBalance: /(?:dönem borcu|toplam borç|new balance|statement balance)[^\n:]*[:-]?\s*/i,
  minimumPayment: /(?:asgari ödeme(?: tutarı)?|minimum payment)[^\n:]*[:-]?\s*/i,
  previousBalance: /(?:önceki bakiye|previous balance)[^\n:]*[:-]?\s*/i,
  interest: /(?:faiz|interest)[^\n:]*[:-]?\s*/i,
  fees: /(?:ücret|masraf|fees?)[^\n:]*[:-]?\s*/i,
  paymentAmount: /(?:ödenen tutar|işlem tutarı|tutar|payment amount|amount paid)[^\n:]*[:-]?\s*/i,
  paymentDate: /(?:ödeme tarihi|işlem tarihi|payment date|transaction date)[^\n:]*[:-]?\s*/i,
  reference: /(?:referans|işlem no|transaction reference)[^\n:]*[:-]?\s*/i,
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

function findAfterLabel(text: string, label: RegExp, kind: "date" | "money" | "text") {
  const candidates: string[] = [];
  for (const match of text.matchAll(
    new RegExp(
      label.source +
        (kind === "date" ? DATE.source : kind === "money" ? MONEY.source : "([A-Za-z0-9-]{3,})"),
      "gi",
    ),
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
    const dateField = field === "statementDate" || field === "dueDate" || field === "paymentDate";
    const candidates = findAfterLabel(
      text,
      label,
      field === "reference" ? "text" : dateField ? "date" : "money",
    );
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
    if (field === "reference") {
      const reference = candidate.replace(label, "").trim().split(/\s+/)[0];
      if (reference)
        fields[field] = { value: reference, confidence: "HIGH", reason: "EXPLICIT_LABEL_MATCH" };
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
    supported: typeof Worker !== "undefined",
    reason: typeof Worker === "undefined" ? "OCR_WORKER_UNAVAILABLE" : undefined,
    languages: ["tur", "eng"],
    localOffline: true,
    maxBytes: 10 * 1024 * 1024,
    engine: "tesseract.js@7.0.0",
  };
}

const imageJobs = new Map<string, Promise<ExtractedDocumentText>>();

/** Local worker OCR returns text only; this module has no Finance persistence dependency. */
export function extractImageTextLocally(
  documentId: string,
  file: Blob & { type: string; size: number },
): Promise<ExtractedDocumentText> {
  const existing = imageJobs.get(documentId);
  if (existing) return existing;
  const job: Promise<ExtractedDocumentText> = (async () => {
    const capability = imageOcrCapability();
    if (!capability.supported) throw new Error(capability.reason);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      throw new Error("OCR_UNSUPPORTED_TYPE");
    if (file.size > capability.maxBytes) throw new Error("OCR_RESOURCE_LIMIT");
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(["tur", "eng"], 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/tesseract-core.wasm.js",
      langPath: "/ocr/lang",
      gzip: true,
    });
    try {
      const result = await worker.recognize(file);
      const text = result.data.text.trim();
      return {
        documentId,
        method: "OCR_IMAGE",
        pages: [text],
        text,
        warnings: text.length < 12 ? ["OCR_LOW_TEXT_VOLUME"] : [],
        extractorVersion: "TESSERACT_JS_7_LOCAL_V1",
        createdAt: Date.now(),
      };
    } finally {
      await worker.terminate();
    }
  })();
  imageJobs.set(documentId, job);
  void job.finally(() => imageJobs.delete(documentId));
  return job;
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
      createdAt: Date.now(),
    };
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  if (pdf.numPages > limits.maxPages)
    return {
      documentId,
      method: "EMBEDDED_PDF_TEXT",
      pages: [],
      text: "",
      warnings: ["EXTRACTION_LIMIT_EXCEEDED"],
      extractorVersion: "PDF_TEXT_V1",
      createdAt: Date.now(),
    };
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent?.();
      if (!content) throw new Error("PDF_TEXT_EXTRACTION_UNAVAILABLE");
      return content.items.map((item) => item.str ?? "").join(" ");
    }),
  );
  return {
    documentId,
    method: "EMBEDDED_PDF_TEXT",
    pages,
    text: pages.join("\n"),
    warnings: pages.join("").trim() ? [] : ["PDF_EMBEDDED_TEXT_INADEQUATE", "OCR_REQUIRED"],
    extractorVersion: "PDF_TEXT_V1",
    createdAt: Date.now(),
  };
}

export async function extractPdfTextWithFallback(
  documentId: string,
  bytes: ArrayBuffer,
  limits = { maxPages: 20, maxBytes: 12 * 1024 * 1024, maxOcrPages: 3, renderScale: 1.5 },
): Promise<ExtractedDocumentText> {
  // pdfjs may transfer its input buffer to its worker. Keep the original bytes intact
  // because the OCR fallback must be able to load the same scanned document again.
  const embedded = await extractPdfEmbeddedText(documentId, bytes.slice(0), limits);
  const usable =
    embedded.text.trim().length >= 40 && /(?:ekstre|ödeme|balance|due|borç)/i.test(embedded.text);
  if (usable || embedded.warnings.includes("EXTRACTION_LIMIT_EXCEEDED")) return embedded;
  const capability = imageOcrCapability();
  if (!capability.supported)
    return { ...embedded, warnings: [...embedded.warnings, "OCR_UNAVAILABLE"] };
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= Math.min(pdf.numPages, limits.maxOcrPages); number++) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport?.({ scale: limits.renderScale });
    if (!viewport || !page.render) throw new Error("PDF_RENDER_UNAVAILABLE");
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("OCR_CANVAS_UNAVAILABLE");
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("OCR_RENDER_FAILED");
    const text = await extractImageTextLocally(
      `${documentId}:${number}`,
      new File([blob], `page-${number}.png`, { type: "image/png" }),
    );
    pages.push(text.text);
  }
  return {
    documentId,
    method: "OCR_PDF",
    pages,
    text: pages.join("\n"),
    warnings: pdf.numPages > limits.maxOcrPages ? ["OCR_PAGE_LIMIT_REACHED"] : [],
    extractorVersion: "PDF_TEXT_OCR_FALLBACK_V1",
    createdAt: Date.now(),
  };
}
