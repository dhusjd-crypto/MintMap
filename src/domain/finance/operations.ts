import type { Clock } from "@/lib/architecture/clock";
import { addMoney, compareMoney, createMoney, subtractMoney, type Money } from "./money";
import type {
  CreditCardStatement,
  FinancialAccount,
  FinancialInstitution,
  FinancialObligation,
  FinancialPayment,
  FinancialSchedule,
  FinancialTransaction,
  FinancialTransfer,
  FinanceBook,
  TransactionSplit,
} from "./models";

export class FinanceDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceDomainError";
  }
}

const nowPair = (clock: Clock) => {
  const now = clock.nowMs();
  return { createdAt: now, updatedAt: now };
};
const requireNonEmpty = (value: string, label: string) => {
  if (!value.trim()) throw new FinanceDomainError(`${label} boş olamaz.`);
};
const sameBook = (bookId: string, entityBookId: string) => {
  if (bookId !== entityBookId) throw new FinanceDomainError("FinanceBook sınırı ihlal edildi.");
};
const sameCurrency = (a: Money, b: Money) => {
  if (a.currency !== b.currency) throw new FinanceDomainError("Para birimleri eşleşmelidir.");
};

export function createFinanceBook(
  input: Pick<FinanceBook, "id" | "name" | "type" | "baseCurrency"> & Partial<FinanceBook>,
  clock: Clock,
): FinanceBook {
  requireNonEmpty(input.name, "FinanceBook adı");
  return { ...input, ...nowPair(clock), metadata: input.metadata ?? {} };
}

export function createInstitution(
  input: Pick<FinancialInstitution, "id" | "name" | "type"> & Partial<FinancialInstitution>,
): FinancialInstitution {
  requireNonEmpty(input.name, "Kurum adı");
  return { ...input, metadata: input.metadata ?? {} };
}

export function createFinancialAccount(
  input: Pick<FinancialAccount, "id" | "financeBookId" | "name" | "type" | "role" | "currency"> &
    Partial<FinancialAccount>,
  clock: Clock,
): FinancialAccount {
  requireNonEmpty(input.name, "Hesap adı");
  if (input.maskedIdentifier?.includes("CVV") || input.maskedIdentifier?.includes("PIN"))
    throw new FinanceDomainError("Gizli kart bilgileri saklanamaz.");
  return { ...input, ...nowPair(clock), metadata: input.metadata ?? {} };
}

export function archiveFinancialAccount(account: FinancialAccount, clock: Clock): FinancialAccount {
  const now = clock.nowMs();
  return { ...account, archivedAt: now, updatedAt: now };
}
export function closeFinancialAccount(account: FinancialAccount, clock: Clock): FinancialAccount {
  const now = clock.nowMs();
  return { ...account, closedAt: now, updatedAt: now };
}

function validateAccountBook(bookId: string, account: FinancialAccount): void {
  sameBook(bookId, account.financeBookId);
}

export function createTransaction(
  input: Pick<FinancialTransaction, "id" | "financeBookId" | "accountId" | "date" | "amount"> &
    Partial<FinancialTransaction>,
  account: FinancialAccount,
  clock: Clock,
): FinancialTransaction {
  validateAccountBook(input.financeBookId, account);
  sameCurrency(input.amount, { minorUnits: 0, currency: account.currency });
  if (input.splits) validateSplits(input.amount, input.splits);
  return {
    ...input,
    status: input.status ?? "UNCLEARED",
    ...nowPair(clock),
    metadata: input.metadata ?? {},
  };
}

export function updateTransaction(
  transaction: FinancialTransaction,
  patch: Partial<FinancialTransaction>,
  clock: Clock,
): FinancialTransaction {
  if (patch.amount) sameCurrency(transaction.amount, patch.amount);
  const next = { ...transaction, ...patch, updatedAt: clock.nowMs() };
  if (next.splits) validateSplits(next.amount, next.splits);
  return next;
}

function validateSplits(parent: Money, splits: TransactionSplit[]): void {
  if (!splits.length) throw new FinanceDomainError("Split işlem en az bir parça içermelidir.");
  const total = splits.reduce(
    (sum, split) => addMoney(sum, split.amount),
    createMoney(0, parent.currency),
  );
  if (compareMoney(total, parent) !== 0)
    throw new FinanceDomainError("Split tutarlarının toplamı işlem tutarına eşit olmalıdır.");
}

export function createSplitTransaction(
  transaction: FinancialTransaction,
  splits: TransactionSplit[],
  clock: Clock,
): FinancialTransaction {
  validateSplits(transaction.amount, splits);
  return updateTransaction(transaction, { splits }, clock);
}

export function changeReconciliationState(
  transaction: FinancialTransaction,
  status: FinancialTransaction["status"],
  clock: Clock,
): FinancialTransaction {
  if (transaction.status === "RECONCILED" && status !== "RECONCILED")
    throw new FinanceDomainError("Reconciled işlem geri açılamaz.");
  const allowed: Record<FinancialTransaction["status"], FinancialTransaction["status"][]> = {
    UNCLEARED: ["CLEARED", "RECONCILED"],
    CLEARED: ["RECONCILED"],
    RECONCILED: [],
  };
  if (status !== transaction.status && !allowed[transaction.status].includes(status))
    throw new FinanceDomainError("Geçersiz reconciliation geçişi.");
  return { ...transaction, status, updatedAt: clock.nowMs() };
}

export function createTransfer(
  input: {
    id: string;
    financeBookId: string;
    sourceAccount: FinancialAccount;
    destinationAccount: FinancialAccount;
    amount: Money;
    sourceTransactionId: string;
    destinationTransactionId: string;
  },
  clock: Clock,
): FinancialTransfer {
  validateAccountBook(input.financeBookId, input.sourceAccount);
  validateAccountBook(input.financeBookId, input.destinationAccount);
  if (input.sourceAccount.id === input.destinationAccount.id)
    throw new FinanceDomainError("Transfer hesapları farklı olmalıdır.");
  if (
    input.sourceAccount.currency !== input.destinationAccount.currency ||
    input.amount.currency !== input.sourceAccount.currency
  )
    throw new FinanceDomainError("Phase 4 transferleri aynı para biriminde olmalıdır.");
  if (input.sourceTransactionId === input.destinationTransactionId)
    throw new FinanceDomainError("Transfer aynı işlemi iki kez bağlayamaz.");
  return {
    id: input.id,
    financeBookId: input.financeBookId,
    sourceAccountId: input.sourceAccount.id,
    destinationAccountId: input.destinationAccount.id,
    sourceTransactionId: input.sourceTransactionId,
    destinationTransactionId: input.destinationTransactionId,
    amount: input.amount,
    ...nowPair(clock),
    metadata: {},
  };
}

export function createFinancialObligation(
  input: Pick<
    FinancialObligation,
    "id" | "financeBookId" | "type" | "title" | "dueDate" | "amountDue"
  > &
    Partial<FinancialObligation>,
  clock: Clock,
): FinancialObligation {
  requireNonEmpty(input.title, "Yükümlülük başlığı");
  validateObligationAmounts(input.amountDue, input.minimumAmount);
  return {
    ...input,
    status: input.status ?? "UPCOMING",
    ...nowPair(clock),
    metadata: input.metadata ?? {},
  };
}

function validateObligationAmounts(amountDue: Money, minimumAmount?: Money): void {
  if (amountDue.minorUnits < 0) throw new FinanceDomainError("Yükümlülük tutarı negatif olamaz.");
  if (minimumAmount) {
    if (minimumAmount.minorUnits < 0) throw new FinanceDomainError("Minimum ödeme negatif olamaz.");
    sameCurrency(amountDue, minimumAmount);
    if (compareMoney(minimumAmount, amountDue) > 0)
      throw new FinanceDomainError("Minimum ödeme toplam tutarı aşamaz.");
  }
}

export function updateFinancialObligation(
  obligation: FinancialObligation,
  patch: Partial<FinancialObligation>,
  clock: Clock,
): FinancialObligation {
  if (patch.status && !canTransitionObligationStatus(obligation.status, patch.status))
    throw new FinanceDomainError("Geçersiz yükümlülük durum geçişi.");
  const next = { ...obligation, ...patch, updatedAt: clock.nowMs() };
  validateObligationAmounts(next.amountDue, next.minimumAmount);
  return next;
}

export function canTransitionObligationStatus(
  from: FinancialObligation["status"],
  to: FinancialObligation["status"],
): boolean {
  if (from === to) return true;
  const allowed: Record<FinancialObligation["status"], FinancialObligation["status"][]> = {
    UPCOMING: ["STATEMENT_RECEIVED", "PAYMENT_DUE", "PAYMENT_SCHEDULED", "CANCELLED"],
    STATEMENT_RECEIVED: ["PAYMENT_DUE", "PAYMENT_SCHEDULED", "CANCELLED"],
    PAYMENT_DUE: ["PAYMENT_SCHEDULED", "PAID", "OVERDUE", "CANCELLED"],
    PAYMENT_SCHEDULED: ["PAYMENT_DUE", "PAID", "OVERDUE", "CANCELLED"],
    OVERDUE: ["PAYMENT_SCHEDULED", "PAID", "CANCELLED"],
    PAID: [],
    CANCELLED: [],
  };
  return allowed[from].includes(to);
}

export function schedulePayment(
  obligation: FinancialObligation,
  input: Pick<FinancialPayment, "id" | "amount"> & Partial<FinancialPayment>,
  clock: Clock,
): FinancialPayment {
  sameBook(obligation.financeBookId, input.financeBookId ?? obligation.financeBookId);
  sameCurrency(obligation.amountDue, input.amount);
  if (input.amount.minorUnits <= 0) throw new FinanceDomainError("Ödeme tutarı pozitif olmalıdır.");
  return {
    ...input,
    id: input.id,
    financeBookId: obligation.financeBookId,
    obligationId: obligation.id,
    amount: input.amount,
    status: "SCHEDULED",
    ...nowPair(clock),
    metadata: input.metadata ?? {},
  };
}

export function recordPayment(payment: FinancialPayment, clock: Clock): FinancialPayment {
  if (payment.status !== "PLANNED" && payment.status !== "SCHEDULED")
    throw new FinanceDomainError("Bu ödeme kaydedilebilir durumda değil.");
  return { ...payment, status: "SUBMITTED", updatedAt: clock.nowMs() };
}

export function confirmPayment(
  payment: FinancialPayment,
  transactionId: string,
  clock: Clock,
): FinancialPayment {
  if (payment.status !== "SUBMITTED")
    throw new FinanceDomainError("Sadece gönderilmiş ödeme onaylanabilir.");
  return {
    ...payment,
    status: "CONFIRMED",
    transactionId,
    confirmedAt: clock.nowMs(),
    paidAt: clock.nowMs(),
    updatedAt: clock.nowMs(),
  };
}
export function failPayment(payment: FinancialPayment, clock: Clock): FinancialPayment {
  if (!["SUBMITTED", "SCHEDULED"].includes(payment.status))
    throw new FinanceDomainError("Ödeme başarısız olarak işaretlenemez.");
  return { ...payment, status: "FAILED", updatedAt: clock.nowMs() };
}
export function cancelPayment(payment: FinancialPayment, clock: Clock): FinancialPayment {
  if (payment.status === "CONFIRMED")
    throw new FinanceDomainError("Onaylanmış ödeme iptal edilemez.");
  return { ...payment, status: "CANCELLED", updatedAt: clock.nowMs() };
}

export function getOutstandingAmount(
  obligation: FinancialObligation,
  payments: FinancialPayment[],
): Money {
  const confirmed = payments
    .filter((payment) => payment.obligationId === obligation.id && payment.status === "CONFIRMED")
    .reduce(
      (sum, payment) => addMoney(sum, payment.amount),
      createMoney(0, obligation.amountDue.currency),
    );
  const outstanding = subtractMoney(obligation.amountDue, confirmed);
  return outstanding.minorUnits < 0 ? createMoney(0, outstanding.currency) : outstanding;
}
export function isFullyPaid(
  obligation: FinancialObligation,
  payments: FinancialPayment[],
): boolean {
  return getOutstandingAmount(obligation, payments).minorUnits <= 0;
}
export function isMinimumSatisfied(
  obligation: FinancialObligation,
  payments: FinancialPayment[],
): boolean {
  if (!obligation.minimumAmount) return isFullyPaid(obligation, payments);
  const paid = subtractMoney(obligation.amountDue, getOutstandingAmount(obligation, payments));
  return compareMoney(paid, obligation.minimumAmount) >= 0;
}
export function isObligationOverdue(obligation: FinancialObligation, clock: Clock): boolean {
  return (
    obligation.status !== "PAID" &&
    obligation.status !== "CANCELLED" &&
    obligation.dueDate < clock.nowMs()
  );
}
export function recalculateObligationStatus(
  obligation: FinancialObligation,
  payments: FinancialPayment[],
  clock: Clock,
): FinancialObligation {
  if (obligation.status === "CANCELLED") return obligation;
  if (isFullyPaid(obligation, payments))
    return { ...obligation, status: "PAID", paidAt: clock.nowMs(), updatedAt: clock.nowMs() };
  if (isObligationOverdue(obligation, clock))
    return { ...obligation, status: "OVERDUE", updatedAt: clock.nowMs() };
  if (
    payments.some(
      (payment) =>
        payment.obligationId === obligation.id &&
        ["SCHEDULED", "SUBMITTED"].includes(payment.status),
    )
  )
    return { ...obligation, status: "PAYMENT_SCHEDULED", updatedAt: clock.nowMs() };
  return obligation.status === "UPCOMING"
    ? { ...obligation, status: "PAYMENT_DUE", updatedAt: clock.nowMs() }
    : obligation;
}

export function cancelObligation(
  obligation: FinancialObligation,
  clock: Clock,
): FinancialObligation {
  if (obligation.status === "PAID")
    throw new FinanceDomainError("Ödenmiş yükümlülük iptal edilemez.");
  return { ...obligation, status: "CANCELLED", updatedAt: clock.nowMs() };
}

export function createCreditCardStatement(
  input: Pick<
    CreditCardStatement,
    | "id"
    | "financeBookId"
    | "cardAccountId"
    | "statementDate"
    | "dueDate"
    | "newBalance"
    | "currency"
  > &
    Partial<CreditCardStatement>,
  clock: Clock,
): CreditCardStatement {
  if (input.newBalance.currency !== input.currency)
    throw new FinanceDomainError("Ekstre para birimi eşleşmiyor.");
  if (input.minimumPayment) {
    sameCurrency(input.newBalance, input.minimumPayment);
    if (compareMoney(input.minimumPayment, input.newBalance) > 0)
      throw new FinanceDomainError("Minimum ödeme ekstre tutarını aşamaz.");
  }
  return {
    ...input,
    reviewStatus: input.reviewStatus ?? "CAPTURED",
    ...nowPair(clock),
    metadata: input.metadata ?? {},
  };
}
export function confirmCreditCardStatement(
  statement: CreditCardStatement,
  clock: Clock,
): CreditCardStatement {
  if (statement.reviewStatus === "RECONCILED")
    throw new FinanceDomainError("Mutabık ekstre değiştirilemez.");
  return { ...statement, reviewStatus: "CONFIRMED", updatedAt: clock.nowMs() };
}
export function markStatementReconciled(
  statement: CreditCardStatement,
  clock: Clock,
): CreditCardStatement {
  if (statement.reviewStatus !== "CONFIRMED")
    throw new FinanceDomainError("Ekstre önce onaylanmalıdır.");
  return { ...statement, reviewStatus: "RECONCILED", updatedAt: clock.nowMs() };
}
export function linkStatementToObligation(
  statement: CreditCardStatement,
  obligations: FinancialObligation[],
  clock: Clock,
): FinancialObligation {
  if (statement.reviewStatus !== "CONFIRMED" && statement.reviewStatus !== "RECONCILED")
    throw new FinanceDomainError("Sadece onaylanmış ekstre yükümlülüğe bağlanabilir.");
  const existing = obligations.find((obligation) => obligation.statementId === statement.id);
  if (existing) return existing;
  return createFinancialObligation(
    {
      id: `${statement.id}:obligation`,
      financeBookId: statement.financeBookId,
      type: "CREDIT_CARD",
      title: `Kredi kartı ekstresi ${statement.id}`,
      accountId: statement.cardAccountId,
      statementId: statement.id,
      statementDate: statement.statementDate,
      dueDate: statement.dueDate,
      amountDue: statement.newBalance,
      minimumAmount: statement.minimumPayment,
    },
    clock,
  );
}

export function createFinancialSchedule(
  input: Pick<
    FinancialSchedule,
    "id" | "financeBookId" | "name" | "type" | "recurrence" | "startDate" | "enabled"
  > &
    Partial<FinancialSchedule>,
  clock: Clock,
): FinancialSchedule {
  requireNonEmpty(input.name, "Finansal plan adı");
  requireNonEmpty(input.recurrence, "Tekrarlama tanımı");
  return { ...input, ...nowPair(clock), metadata: input.metadata ?? {} };
}
