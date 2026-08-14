import { nanoid } from "nanoid";
import {
  changeReconciliationState,
  createCreditCardStatement,
  createMoney,
  type FinanceCaptureProposal,
  type FinanceImportBatch,
  type ImportRowProposal,
  type ImportMatchConfidence,
  type PaymentEvidenceMatch,
  type ReconciliationSession,
} from "@/domain/finance";
import { systemClock, type Clock } from "@/lib/architecture/clock";
import { createFinancePersistence } from "@/lib/canonical-persistence/repositories";
import { parseMoneyInput } from "./money-input";
import { parseStructuredImport, type ImportFormat, type ParsedImportRow } from "./import-formats";

export type CsvMapping = {
  date: string;
  amount?: string;
  debit?: string;
  credit?: string;
  description?: string;
  reference?: string;
  externalId?: string;
  currency?: string;
  dateFormat?: "DD.MM.YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
};
const parseDate = (value: string, format?: CsvMapping["dateFormat"]) => {
  const trimmed = value.trim();
  if (format === "YYYY-MM-DD" && /^\d{4}-\d{2}-\d{2}$/.test(trimmed))
    return Date.parse(`${trimmed}T12:00:00Z`);
  const match = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (match && format) return Date.parse(`${match[3]}-${match[2]}-${match[1]}T12:00:00Z`);
  return undefined;
};
export function normalizeDescription(value = "") {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}
export function parseCsvRows(text: string, mapping: CsvMapping, currency: "TRY" | "USD" | "EUR") {
  const [headerLine, ...lines] = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const separator =
    (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = headerLine.split(separator).map((x) => x.trim());
  const at = (row: string[], column?: string) =>
    column ? row[headers.indexOf(column)]?.trim() : undefined;
  if (!headers.includes(mapping.date) || (!mapping.amount && !mapping.debit && !mapping.credit))
    throw new Error("MISSING_REQUIRED_COLUMN");
  return lines.map((line, index) => {
    const row = line.split(separator);
    const date = parseDate(at(row, mapping.date) ?? "", mapping.dateFormat);
    const amountText = mapping.amount ? at(row, mapping.amount) : undefined;
    const debit = at(row, mapping.debit);
    const credit = at(row, mapping.credit);
    try {
      const amount = amountText
        ? (() => {
            const negative = amountText.trim().startsWith("-");
            const parsed = parseMoneyInput(amountText.replace(/^\s*-/, ""), currency);
            return negative ? { ...parsed, minorUnits: -parsed.minorUnits } : parsed;
          })()
        : createMoney(
            (credit ? parseMoneyInput(credit, currency).minorUnits : 0) -
              (debit ? parseMoneyInput(debit, currency).minorUnits : 0),
            currency,
          );
      return {
        index,
        date,
        amount,
        description: at(row, mapping.description),
        reference: at(row, mapping.reference),
        externalId: at(row, mapping.externalId),
        warnings: date ? [] : ["INVALID_DATE"],
      };
    } catch {
      return { index, warnings: ["INVALID_AMOUNT"] as string[] };
    }
  });
}
export function matchImportRow(
  row: Pick<ImportRowProposal, "amount" | "date" | "externalId" | "description" | "reference">,
  transactions: readonly {
    id: string;
    accountId: string;
    amount: { minorUnits: number; currency: string };
    date: number;
    description?: string;
    metadata: Record<string, unknown>;
  }[],
  accountId: string,
) {
  const candidates = transactions
    .filter((tx) => tx.accountId === accountId)
    .map((tx) => {
      const reasons: string[] = [];
      if (row.externalId && tx.metadata.externalId === row.externalId)
        reasons.push("EXACT_EXTERNAL_ID");
      if (
        row.amount &&
        tx.amount.minorUnits === row.amount.minorUnits &&
        tx.amount.currency === row.amount.currency
      )
        reasons.push("EXACT_AMOUNT");
      if (row.date && tx.date === row.date) reasons.push("EXACT_DATE");
      if (row.reference && tx.metadata.reference === row.reference) reasons.push("REFERENCE_MATCH");
      if (
        row.description &&
        normalizeDescription(tx.description) === normalizeDescription(row.description)
      )
        reasons.push("DESCRIPTION_MATCH");
      const confidence: ImportMatchConfidence = reasons.includes("EXACT_EXTERNAL_ID")
        ? "EXACT"
        : reasons.includes("EXACT_AMOUNT") &&
            reasons.includes("EXACT_DATE") &&
            (reasons.includes("REFERENCE_MATCH") || reasons.includes("DESCRIPTION_MATCH"))
          ? "HIGH"
          : reasons.includes("EXACT_AMOUNT") && reasons.includes("EXACT_DATE")
            ? "MEDIUM"
            : "NONE";
      return { transactionId: tx.id, confidence, reasonCodes: reasons };
    })
    .filter((x) => x.confidence !== "NONE");
  const ranks: Record<"EXACT" | "HIGH" | "MEDIUM" | "LOW" | "NONE", number> = {
    EXACT: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
    NONE: 0,
  };
  return candidates.sort(
    (a, b) => ranks[b.confidence as keyof typeof ranks] - ranks[a.confidence as keyof typeof ranks],
  );
}

/** Evidence matching remains a proposal. Only a later explicit command confirms a payment. */
export function matchPaymentEvidence(
  evidence: {
    amount?: { minorUnits: number; currency: string };
    date?: number;
    reference?: string;
  },
  payments: readonly {
    id: string;
    obligationId: string;
    amount: { minorUnits: number; currency: string };
    paymentReference?: string;
    scheduledFor?: number;
    transferId?: string;
  }[],
): PaymentEvidenceMatch[] {
  const ranks: Record<ImportMatchConfidence, number> = {
    EXACT: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
    NONE: 0,
  };
  return payments
    .map((payment) => {
      const reasonCodes: string[] = [];
      if (evidence.reference && evidence.reference === payment.paymentReference)
        reasonCodes.push("EXACT_REFERENCE");
      if (evidence.amount?.currency === payment.amount.currency) reasonCodes.push("EXACT_CURRENCY");
      if (evidence.amount?.minorUnits === payment.amount.minorUnits)
        reasonCodes.push("EXACT_AMOUNT");
      if (evidence.date && payment.scheduledFor) {
        const days = Math.abs(evidence.date - payment.scheduledFor) / 86_400_000;
        if (days < 1) reasonCodes.push("DATE_MATCH");
        else if (days <= 3) reasonCodes.push("DATE_NEAR");
      }
      const confidence: ImportMatchConfidence =
        reasonCodes.includes("EXACT_REFERENCE") && reasonCodes.includes("EXACT_AMOUNT")
          ? "EXACT"
          : reasonCodes.includes("EXACT_AMOUNT") &&
              reasonCodes.includes("EXACT_CURRENCY") &&
              reasonCodes.some((x) => x.startsWith("DATE_"))
            ? "HIGH"
            : reasonCodes.includes("EXACT_AMOUNT") && reasonCodes.includes("EXACT_CURRENCY")
              ? "MEDIUM"
              : "NONE";
      return {
        paymentId: payment.id,
        transferId: payment.transferId,
        obligationId: payment.obligationId,
        confidence,
        reasonCodes,
      };
    })
    .filter((match) => match.confidence !== "NONE")
    .sort((a, b) => ranks[b.confidence] - ranks[a.confidence]);
}

function toRowProposals(
  parsed: ParsedImportRow[],
  batchId: string,
  transactions: Awaited<
    ReturnType<ReturnType<typeof createFinancePersistence>["listTransactions"]>
  >,
  accountId: string,
) {
  return parsed.map((row) => {
    const matchCandidates = row.amount ? matchImportRow(row, transactions, accountId) : [];
    const exact = matchCandidates[0]?.confidence === "EXACT";
    return {
      id: nanoid(12),
      batchId,
      date: row.date,
      amount: row.amount,
      currency: row.amount?.currency,
      description: row.description,
      reference: row.reference,
      externalId: row.externalId,
      warnings: row.warnings,
      matchCandidates,
      decision: row.warnings.length
        ? "REVIEW"
        : exact
          ? "SKIP_DUPLICATE"
          : matchCandidates.length
            ? "REVIEW"
            : "IMPORT_NEW",
      errorCode: row.warnings[0],
      metadata: row.metadata,
    } satisfies ImportRowProposal;
  });
}
export function createFinanceCaptureImportApplication(
  deps: { persistence?: ReturnType<typeof createFinancePersistence>; clock?: Clock } = {},
) {
  const persistence = deps.persistence ?? createFinancePersistence();
  const clock = deps.clock ?? systemClock;
  return {
    commands: {
      async createStatementProposal(
        input: Omit<FinanceCaptureProposal, "id" | "createdAt" | "reviewStatus">,
      ) {
        const proposal: FinanceCaptureProposal = {
          ...input,
          id: nanoid(12),
          createdAt: clock.nowMs(),
          reviewStatus: "REVIEW_REQUIRED",
        };
        await persistence.repositories.captureProposals.save(proposal);
        return proposal;
      },
      async confirmStatementProposal(
        proposalId: string,
        input: {
          financeBookId: string;
          cardAccountId: string;
          statementDate: number;
          dueDate: number;
          newBalance: { minorUnits: number; currency: "TRY" | "USD" | "EUR" };
          minimumPayment?: { minorUnits: number; currency: "TRY" | "USD" | "EUR" };
        },
      ) {
        const proposal = await persistence.repositories.captureProposals.get(proposalId);
        if (!proposal) throw new Error("Teklif bulunamadı.");
        const duplicates = (await persistence.listStatements(input.financeBookId)).filter(
          (x) =>
            x.cardAccountId === input.cardAccountId &&
            (x.statementDate === input.statementDate ||
              (proposal.sourceDocumentId !== undefined &&
                x.sourceDocumentId === proposal.sourceDocumentId)),
        );
        if (duplicates.length) throw new Error("DUPLICATE_STATEMENT");
        const statement = createCreditCardStatement(
          {
            id: nanoid(12),
            financeBookId: input.financeBookId,
            cardAccountId: input.cardAccountId,
            statementDate: input.statementDate,
            dueDate: input.dueDate,
            newBalance: input.newBalance,
            minimumPayment: input.minimumPayment,
            currency: input.newBalance.currency,
            reviewStatus: "CONFIRMED",
            sourceDocumentId: proposal.sourceDocumentId,
            sourceType: "PDF",
            metadata: { captureItemId: proposal.captureItemId },
          },
          clock,
        );
        await persistence.saveStatement(statement);
        await persistence.repositories.captureProposals.save({
          ...proposal,
          reviewStatus: "CONFIRMED",
        });
        return statement;
      },
      async createCsvBatch(input: {
        financeBookId: string;
        accountId: string;
        filename: string;
        csv: string;
        mapping: CsvMapping;
        currency: "TRY" | "USD" | "EUR";
        sourceDocumentId?: string;
      }) {
        const account = await persistence.repositories.accounts.get(input.accountId);
        if (
          !account ||
          account.financeBookId !== input.financeBookId ||
          account.currency !== input.currency
        )
          throw new Error("ACCOUNT_CURRENCY_MISMATCH");
        const batch: FinanceImportBatch = {
          id: nanoid(12),
          financeBookId: input.financeBookId,
          accountId: input.accountId,
          filename: input.filename,
          format: "CSV",
          createdAt: clock.nowMs(),
          updatedAt: clock.nowMs(),
          status: "REVIEW_REQUIRED",
          rowCount: 0,
          acceptedCount: 0,
          skippedCount: 0,
          duplicateCount: 0,
          errorCount: 0,
          sourceDocumentId: input.sourceDocumentId,
          parserVersion: "CSV_IMPORT_V1",
          metadata: {},
        };
        const rows = parseCsvRows(input.csv, input.mapping, input.currency);
        const transactions = await persistence.listTransactions(input.financeBookId);
        const proposals = toRowProposals(
          rows.map((row) => ({ ...row, metadata: {} })),
          batch.id,
          transactions,
          input.accountId,
        );
        batch.rowCount = proposals.length;
        batch.duplicateCount = proposals.filter((x) => x.decision === "SKIP_DUPLICATE").length;
        batch.errorCount = proposals.filter((x) => x.warnings.length).length;
        await persistence.repositories.importBatches.save(batch);
        await Promise.all(proposals.map((row) => persistence.repositories.importRows.save(row)));
        return { batch, rows: proposals };
      },
      async createStructuredImportBatch(input: {
        financeBookId: string;
        accountId: string;
        filename: string;
        content: string;
        format: Exclude<ImportFormat, "CSV">;
        currency: "TRY" | "USD" | "EUR";
        sourceDocumentId?: string;
      }) {
        const account = await persistence.repositories.accounts.get(input.accountId);
        if (
          !account ||
          account.financeBookId !== input.financeBookId ||
          account.currency !== input.currency
        )
          throw new Error("ACCOUNT_CURRENCY_MISMATCH");
        const batch: FinanceImportBatch = {
          id: nanoid(12),
          financeBookId: input.financeBookId,
          accountId: input.accountId,
          filename: input.filename,
          format: input.format,
          createdAt: clock.nowMs(),
          updatedAt: clock.nowMs(),
          status: "REVIEW_REQUIRED",
          rowCount: 0,
          acceptedCount: 0,
          skippedCount: 0,
          duplicateCount: 0,
          errorCount: 0,
          sourceDocumentId: input.sourceDocumentId,
          parserVersion: `${input.format}_IMPORT_V1`,
          metadata: {
            trust: input.format === "QIF" ? "QIF_WEAK_ID" : "BANK_FILE_WITH_EXTERNAL_ID",
          },
        };
        const parsed = parseStructuredImport(input.content, input.format, input.currency);
        const rows = toRowProposals(
          parsed,
          batch.id,
          await persistence.listTransactions(input.financeBookId),
          input.accountId,
        );
        batch.rowCount = rows.length;
        batch.duplicateCount = rows.filter((x) => x.decision === "SKIP_DUPLICATE").length;
        batch.errorCount = rows.filter((x) => x.warnings.length).length;
        await persistence.repositories.importBatches.save(batch);
        await Promise.all(rows.map((row) => persistence.repositories.importRows.save(row)));
        return { batch, rows };
      },
      async confirmImportRows(batchId: string, rowIds: string[]) {
        const batch = await persistence.repositories.importBatches.get(batchId);
        if (!batch) throw new Error("Import batch bulunamadı.");
        const rows = (await persistence.repositories.importRows.list()).filter(
          (row) => row.batchId === batchId && rowIds.includes(row.id),
        );
        let accepted = 0;
        for (const row of rows) {
          if (row.decision !== "IMPORT_NEW" || !row.amount || !row.date) continue;
          const account = await persistence.repositories.accounts.get(batch.accountId);
          if (!account) throw new Error("Hesap bulunamadı.");
          const transaction = {
            id: nanoid(12),
            financeBookId: batch.financeBookId,
            accountId: batch.accountId,
            date: row.date,
            amount: row.amount,
            description: row.description,
            status: "CLEARED" as const,
            sourceType: "CSV_IMPORT" as const,
            metadata: {
              externalId: row.externalId ?? "",
              reference: row.reference ?? "",
              importBatchId: batchId,
            },
          };
          await persistence.saveTransaction({
            ...transaction,
            createdAt: clock.nowMs(),
            updatedAt: clock.nowMs(),
          });
          accepted++;
        }
        const next = {
          ...batch,
          status: accepted === rows.length ? ("CONFIRMED" as const) : ("PARTIAL" as const),
          acceptedCount: batch.acceptedCount + accepted,
          updatedAt: clock.nowMs(),
        };
        await persistence.repositories.importBatches.save(next);
        return next;
      },
      async startReconciliation(
        input: Omit<ReconciliationSession, "id" | "createdAt" | "status" | "metadata">,
      ) {
        const session: ReconciliationSession = {
          ...input,
          id: nanoid(12),
          status: "IN_PROGRESS",
          createdAt: clock.nowMs(),
          metadata: {},
        };
        await persistence.repositories.reconciliationSessions.save(session);
        return session;
      },
      async completeReconciliation(sessionId: string) {
        const session = await persistence.repositories.reconciliationSessions.get(sessionId);
        if (!session) throw new Error("Reconciliation bulunamadı.");
        const transactions = (await persistence.listTransactions(session.financeBookId)).filter(
          (tx) => session.transactionIds.includes(tx.id),
        );
        const opening = session.openingBalance?.minorUnits ?? 0;
        const calculated =
          opening + transactions.reduce((sum, tx) => sum + tx.amount.minorUnits, 0);
        if (calculated !== session.closingBalance.minorUnits)
          throw new Error("RECONCILIATION_DIFFERENCE");
        for (const tx of transactions)
          await persistence.saveTransaction(changeReconciliationState(tx, "RECONCILED", clock));
        const done = { ...session, status: "COMPLETED" as const, completedAt: clock.nowMs() };
        await persistence.repositories.reconciliationSessions.save(done);
        return done;
      },
    },
    queries: {
      async reconciliationDifference(sessionId: string) {
        const session = await persistence.repositories.reconciliationSessions.get(sessionId);
        if (!session) return undefined;
        const transactions = (await persistence.listTransactions(session.financeBookId)).filter(
          (tx) => session.transactionIds.includes(tx.id),
        );
        const base = session.openingBalance?.minorUnits ?? 0;
        return {
          session,
          calculatedMinorUnits:
            base + transactions.reduce((sum, tx) => sum + tx.amount.minorUnits, 0),
          differenceMinorUnits:
            session.closingBalance.minorUnits -
            base -
            transactions.reduce((sum, tx) => sum + tx.amount.minorUnits, 0),
        };
      },
    },
  };
}
export const financeCaptureImportApplication = createFinanceCaptureImportApplication();
