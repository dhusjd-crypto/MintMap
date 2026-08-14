import type { CurrencyCode, Money } from "./money";

export type FinanceDocumentType =
  | "CREDIT_CARD_STATEMENT"
  | "BANK_STATEMENT"
  | "PAYMENT_CONFIRMATION"
  | "INVOICE"
  | "RECEIPT"
  | "UNKNOWN_FINANCIAL";
export type FinanceFieldConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type FinanceCaptureProposal = {
  id: string;
  captureItemId: string;
  documentType: FinanceDocumentType;
  financeBookId?: string;
  accountCandidateIds: string[];
  fields: Record<string, string | number | boolean | Money | undefined>;
  fieldConfidence: Record<string, FinanceFieldConfidence>;
  warnings: string[];
  reviewStatus: "REVIEW_REQUIRED" | "CONFIRMED" | "REJECTED";
  createdAt: number;
  extractorVersion: string;
  sourceDocumentId?: string;
  metadata: Record<string, unknown>;
};
export type ImportBatchStatus =
  "CREATED" | "PARSED" | "REVIEW_REQUIRED" | "CONFIRMED" | "PARTIAL" | "FAILED" | "CANCELLED";
export type FinanceImportBatch = {
  id: string;
  financeBookId: string;
  accountId: string;
  filename: string;
  format: "CSV" | "OFX" | "QFX" | "QIF" | "CAMT";
  createdAt: number;
  updatedAt: number;
  status: ImportBatchStatus;
  rowCount: number;
  acceptedCount: number;
  skippedCount: number;
  duplicateCount: number;
  errorCount: number;
  sourceDocumentId?: string;
  parserVersion: string;
  metadata: Record<string, unknown>;
};
export type ImportDecision =
  "IMPORT_NEW" | "MATCH_EXISTING" | "SKIP_DUPLICATE" | "REVIEW" | "REJECT";
export type ImportMatchConfidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type ImportMatch = {
  transactionId: string;
  confidence: ImportMatchConfidence;
  reasonCodes: string[];
};
export type ImportRowProposal = {
  id: string;
  batchId: string;
  date?: number;
  amount?: Money;
  currency?: CurrencyCode;
  description?: string;
  reference?: string;
  externalId?: string;
  warnings: string[];
  matchCandidates: ImportMatch[];
  decision: ImportDecision;
  errorCode?: string;
  metadata: Record<string, unknown>;
};
export type ReconciliationSession = {
  id: string;
  financeBookId: string;
  accountId: string;
  statementId?: string;
  openingBalance?: Money;
  closingBalance: Money;
  transactionIds: string[];
  status: "DRAFT" | "IN_PROGRESS" | "BALANCED" | "COMPLETED" | "CANCELLED";
  createdAt: number;
  completedAt?: number;
  metadata: Record<string, unknown>;
};
