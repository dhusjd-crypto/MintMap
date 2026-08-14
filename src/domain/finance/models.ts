import type { Money, CurrencyCode } from "./money";

export type FinanceBookType = "PERSONAL" | "BUSINESS" | "CUSTOM";
export type InstitutionType =
  "BANK" | "BROKER" | "CASH" | "GOVERNMENT" | "UTILITY" | "SUPPLIER" | "OTHER";
export type AccountType = "BANK" | "CASH" | "CREDIT_CARD" | "LOAN" | "INVESTMENT" | "OTHER";
export type AccountRole = "ASSET" | "LIABILITY";
export type TransactionStatus = "UNCLEARED" | "CLEARED" | "RECONCILED";
export type CategoryType = "INCOME" | "EXPENSE" | "TRANSFER_EXCLUDED" | "OTHER";
export type ObligationType =
  | "CREDIT_CARD"
  | "LOAN"
  | "TAX"
  | "SOCIAL_SECURITY"
  | "UTILITY"
  | "RENT"
  | "SUPPLIER"
  | "SUBSCRIPTION"
  | "INSURANCE"
  | "SALARY"
  | "OTHER";
export type ObligationStatus =
  | "UPCOMING"
  | "STATEMENT_RECEIVED"
  | "PAYMENT_DUE"
  | "PAYMENT_SCHEDULED"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";
export type PaymentStatus =
  "PLANNED" | "SCHEDULED" | "SUBMITTED" | "CONFIRMED" | "FAILED" | "CANCELLED";
export type StatementReviewStatus = "CAPTURED" | "REVIEW_REQUIRED" | "CONFIRMED" | "RECONCILED";
export type FinanceSourceType =
  | "MANUAL"
  | "CSV_IMPORT"
  | "OFX_IMPORT"
  | "QFX_IMPORT"
  | "QIF_IMPORT"
  | "CAMT_IMPORT"
  | "SCREENSHOT"
  | "PDF"
  | "EMAIL"
  | "BANK_CONNECTOR"
  | "OTHER";

export type FinanceBook = {
  id: string;
  name: string;
  type: FinanceBookType;
  baseCurrency: CurrencyCode;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  metadata: Record<string, unknown>;
};
export type FinancialInstitution = {
  id: string;
  name: string;
  type: InstitutionType;
  country?: string;
  metadata: Record<string, unknown>;
};
export type FinancialAccount = {
  id: string;
  financeBookId: string;
  institutionId?: string;
  name: string;
  type: AccountType;
  role: AccountRole;
  currency: CurrencyCode;
  maskedIdentifier?: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  archivedAt?: number;
  metadata: Record<string, unknown>;
};
export type FinancialCategory = {
  id: string;
  financeBookId: string;
  name: string;
  parentId?: string;
  type?: CategoryType;
  archivedAt?: number;
  metadata: Record<string, unknown>;
};
export type Payee = {
  id: string;
  financeBookId: string;
  name: string;
  normalizedName?: string;
  institutionId?: string;
  metadata: Record<string, unknown>;
};
export type TransactionSplit = {
  categoryId?: string;
  payeeId?: string;
  amount: Money;
  description?: string;
};
export type FinancialTransaction = {
  id: string;
  financeBookId: string;
  accountId: string;
  date: number;
  createdAt: number;
  updatedAt: number;
  amount: Money;
  payeeId?: string;
  categoryId?: string;
  description?: string;
  notes?: string;
  status: TransactionStatus;
  transferId?: string;
  statementId?: string;
  sourceType?: FinanceSourceType;
  sourceId?: string;
  attachmentIds?: string[];
  splits?: TransactionSplit[];
  metadata: Record<string, unknown>;
};
export type FinancialTransfer = {
  id: string;
  financeBookId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceTransactionId: string;
  destinationTransactionId: string;
  amount: Money;
  createdAt: number;
  metadata: Record<string, unknown>;
};
export type FinancialObligation = {
  id: string;
  financeBookId: string;
  type: ObligationType;
  title: string;
  institutionId?: string;
  accountId?: string;
  maskedIdentifier?: string;
  statementId?: string;
  statementDate?: number;
  dueDate: number;
  amountDue: Money;
  minimumAmount?: Money;
  status: ObligationStatus;
  recurrenceScheduleId?: string;
  paymentAccountId?: string;
  createdAt: number;
  updatedAt: number;
  paidAt?: number;
  sourceType?: FinanceSourceType;
  sourceId?: string;
  metadata: Record<string, unknown>;
};
export type FinancialPayment = {
  id: string;
  financeBookId: string;
  obligationId: string;
  fromAccountId?: string;
  amount: Money;
  status: PaymentStatus;
  scheduledFor?: number;
  paidAt?: number;
  confirmedAt?: number;
  transactionId?: string;
  transferId?: string;
  paymentReference?: string;
  createdAt: number;
  updatedAt: number;
  sourceType?: FinanceSourceType;
  sourceId?: string;
  metadata: Record<string, unknown>;
};
export type CreditCardStatement = {
  id: string;
  financeBookId: string;
  cardAccountId: string;
  institutionId?: string;
  statementDate: number;
  dueDate: number;
  previousBalance?: Money;
  newBalance: Money;
  minimumPayment?: Money;
  totalPurchases?: Money;
  interest?: Money;
  fees?: Money;
  paymentsAndCredits?: Money;
  currency: CurrencyCode;
  reviewStatus: StatementReviewStatus;
  sourceDocumentId?: string;
  sourceType?: FinanceSourceType;
  sourceId?: string;
  extractionConfidence?: number;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};
export type FinancialSchedule = {
  id: string;
  financeBookId: string;
  name: string;
  type: ObligationType;
  recurrence: string;
  startDate: number;
  endDate?: number;
  nextOccurrence?: number;
  enabled: boolean;
  templateSource?: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};

export type CashflowItemDirection = "INFLOW" | "OUTFLOW";
export type CashflowItemConfidence = "COMMITTED" | "EXPECTED" | "ESTIMATED" | "OPTIONAL";
export type ExpectedCashflowItemStatus = "ACTIVE" | "REALIZED" | "CANCELLED" | "MISSED";
export type ExpectedCashflowItem = {
  id: string;
  financeBookId: string;
  title: string;
  direction: CashflowItemDirection;
  amount: Money;
  expectedAt: number;
  confidence: CashflowItemConfidence;
  status: ExpectedCashflowItemStatus;
  accountId?: string;
  transactionId?: string;
  recurrence?: string;
  sourceType?: "MANUAL_FORECAST_ITEM" | "EXPECTED_INCOME" | "EXPECTED_EXPENSE" | "RECURRING_INCOME" | "RECURRING_EXPENSE";
  sourceId?: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};

export type BudgetPeriodType = "MONTHLY" | "WEEKLY" | "CUSTOM";
export type BudgetStatus = "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
export type Budget = {
  id: string;
  financeBookId: string;
  name: string;
  periodType: BudgetPeriodType;
  startDate: number;
  endDate: number;
  currency: CurrencyCode;
  status: BudgetStatus;
  warningThresholds: number[];
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};
export type BudgetAllocation = {
  id: string;
  budgetId: string;
  financeBookId: string;
  categoryId?: string;
  amount: Money;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};

export type FinancialGoalType =
  | "EMERGENCY_FUND"
  | "LAND"
  | "REAL_ESTATE"
  | "VEHICLE"
  | "INVESTMENT_CAPITAL"
  | "DEBT_PAYOFF"
  | "TAX_RESERVE"
  | "CUSTOM";
export type FinancialGoalStatus = "ACTIVE" | "ACHIEVED" | "PAUSED" | "CANCELLED" | "ARCHIVED";
export type FinancialGoalCurrentAmountMode =
  | "MANUAL"
  | "LINKED_ACCOUNT_BALANCE"
  | "LINKED_ACCOUNT_SUM"
  | "DEBT_REDUCTION"
  | "RESERVE_BALANCE";
export type FinancialGoal = {
  id: string;
  financeBookId: string;
  name: string;
  type: FinancialGoalType;
  targetAmount: Money;
  currency: CurrencyCode;
  targetDate?: number;
  currentAmountMode: FinancialGoalCurrentAmountMode;
  linkedAccountIds?: string[];
  manualCurrentAmount?: Money;
  status: FinancialGoalStatus;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};
