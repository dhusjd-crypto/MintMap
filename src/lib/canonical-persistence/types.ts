import type {
  FinancialAccount,
  FinancialCategory,
  FinancialInstitution,
  FinancialObligation,
  FinancialPayment,
  FinancialSchedule,
  FinancialTransaction,
  FinanceBook,
  CreditCardStatement,
  FinancialTransfer,
  Payee,
} from "@/domain/finance/models";

export const CANONICAL_SCHEMA_VERSION = 1 as const;
export const CANONICAL_DB_NAME = "mintmap-canonical";
export const CANONICAL_DB_VERSION = 1;

export const CANONICAL_STORES = [
  "meta",
  "execution_extensions",
  "finance_books",
  "finance_institutions",
  "finance_accounts",
  "finance_categories",
  "finance_payees",
  "finance_transactions",
  "finance_transfers",
  "finance_obligations",
  "finance_payments",
  "finance_statements",
  "finance_schedules",
  "migration_journal",
  "persistence_operations",
] as const;

export type CanonicalStoreName = (typeof CANONICAL_STORES)[number];

export type PersistenceEnvelope<T> = {
  id: string;
  entityType: string;
  schemaVersion: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
  payload: T;
};

export type CanonicalEntity =
  | FinanceBook
  | FinancialInstitution
  | FinancialAccount
  | FinancialCategory
  | Payee
  | FinancialTransaction
  | FinancialTransfer
  | FinancialObligation
  | FinancialPayment
  | CreditCardStatement
  | FinancialSchedule;

export type CanonicalRecord = PersistenceEnvelope<CanonicalEntity | Record<string, unknown>>;

export type CanonicalPersistenceErrorCode =
  | "UNAVAILABLE"
  | "INVALID_RECORD"
  | "RELATIONSHIP_MISSING"
  | "SCHEMA_MISMATCH"
  | "MIGRATION_FAILED"
  | "BACKUP_REQUIRED"
  | "WRITE_FAILED";

export class CanonicalPersistenceError extends Error {
  constructor(
    message: string,
    readonly code: CanonicalPersistenceErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CanonicalPersistenceError";
  }
}

export type CanonicalStorage = {
  get<T>(store: CanonicalStoreName, id: string): Promise<PersistenceEnvelope<T> | undefined>;
  list<T>(store: CanonicalStoreName): Promise<PersistenceEnvelope<T>[]>;
  put<T>(store: CanonicalStoreName, value: PersistenceEnvelope<T>): Promise<void>;
  remove(store: CanonicalStoreName, id: string): Promise<void>;
};
