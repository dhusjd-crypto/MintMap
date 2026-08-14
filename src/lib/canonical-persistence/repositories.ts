import type {
  CreditCardStatement,
  FinancialAccount,
  FinancialCategory,
  FinancialInstitution,
  FinancialObligation,
  FinancialPayment,
  FinancialSchedule,
  FinancialTransaction,
  FinancialTransfer,
  FinanceBook,
  Payee,
  ExpectedCashflowItem,
  Budget,
  BudgetAllocation,
  FinancialGoal,
} from "@/domain/finance/models";
import type {
  FinanceCaptureProposal,
  FinanceImportBatch,
  ImportRowProposal,
  ReconciliationSession,
} from "@/domain/finance/capture-import";
import { validateMoney } from "@/domain/finance/money";
import {
  CanonicalPersistenceError,
  type CanonicalStorage,
  type CanonicalStoreName,
  type PersistenceEnvelope,
} from "./types";
import { canonicalStorage } from "./storage";

export type AsyncRepository<T extends { id: string }> = {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  save(value: T): Promise<void>;
  remove(id: string): Promise<void>;
};

const ENTITY_STORE: Record<string, CanonicalStoreName> = {
  FinanceBook: "finance_books",
  FinancialInstitution: "finance_institutions",
  FinancialAccount: "finance_accounts",
  FinancialCategory: "finance_categories",
  Payee: "finance_payees",
  FinancialTransaction: "finance_transactions",
  FinancialTransfer: "finance_transfers",
  FinancialObligation: "finance_obligations",
  FinancialPayment: "finance_payments",
  CreditCardStatement: "finance_statements",
  FinancialSchedule: "finance_schedules",
  ExpectedCashflowItem: "expected_cashflow_items",
  Budget: "budgets",
  BudgetAllocation: "budget_allocations",
  FinancialGoal: "financial_goals",
};

function envelope<T extends { id: string }>(
  entityType: string,
  value: T,
  previous?: PersistenceEnvelope<T>,
): PersistenceEnvelope<T> {
  const now = Date.now();
  return {
    id: value.id,
    entityType,
    schemaVersion: 1,
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    payload: structuredClone(value),
  };
}

export class IndexedDbRepository<T extends { id: string }> implements AsyncRepository<T> {
  constructor(
    private readonly entityType: string,
    private readonly store: CanonicalStoreName,
    private readonly storage: CanonicalStorage = canonicalStorage,
  ) {}
  async get(id: string) {
    const record = await this.storage.get<T>(this.store, id);
    return this.read(record);
  }
  async list() {
    const result: T[] = [];
    for (const record of await this.storage.list<T>(this.store)) {
      const value = this.read(record);
      if (value) result.push(value);
    }
    return result;
  }
  async save(value: T) {
    const previous = await this.storage.get<T>(this.store, value.id);
    await this.storage.put(this.store, envelope(this.entityType, value, previous));
  }
  async remove(id: string) {
    await this.storage.remove(this.store, id);
  }
  private read(record: PersistenceEnvelope<T> | undefined): T | undefined {
    if (!record) return undefined;
    if (
      record.entityType !== this.entityType ||
      !record.id ||
      !record.payload ||
      typeof record.payload !== "object"
    ) {
      void this.storage.put("persistence_operations", {
        id: `quarantine:${this.store}:${record?.id ?? "unknown"}`,
        entityType: "QuarantinedCanonicalRecord",
        schemaVersion: 1,
        revision: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        payload: {
          store: this.store,
          recordId: record?.id,
          status: "QUARANTINED",
          reason: "invalid-envelope",
        },
      });
      return undefined;
    }
    return record.payload;
  }
}

export type FinanceRepositories = {
  books: AsyncRepository<FinanceBook>;
  institutions: AsyncRepository<FinancialInstitution>;
  accounts: AsyncRepository<FinancialAccount>;
  categories: AsyncRepository<FinancialCategory>;
  payees: AsyncRepository<Payee>;
  transactions: AsyncRepository<FinancialTransaction>;
  transfers: AsyncRepository<FinancialTransfer>;
  obligations: AsyncRepository<FinancialObligation>;
  payments: AsyncRepository<FinancialPayment>;
  statements: AsyncRepository<CreditCardStatement>;
  schedules: AsyncRepository<FinancialSchedule>;
  captureProposals: AsyncRepository<FinanceCaptureProposal>;
  importBatches: AsyncRepository<FinanceImportBatch>;
  importRows: AsyncRepository<ImportRowProposal>;
  reconciliationSessions: AsyncRepository<ReconciliationSession>;
  expectedCashflowItems: AsyncRepository<ExpectedCashflowItem>;
  budgets: AsyncRepository<Budget>;
  budgetAllocations: AsyncRepository<BudgetAllocation>;
  financialGoals: AsyncRepository<FinancialGoal>;
};

export function createFinanceRepositories(
  storage: CanonicalStorage = canonicalStorage,
): FinanceRepositories {
  return {
    books: new IndexedDbRepository("FinanceBook", ENTITY_STORE.FinanceBook, storage),
    institutions: new IndexedDbRepository(
      "FinancialInstitution",
      ENTITY_STORE.FinancialInstitution,
      storage,
    ),
    accounts: new IndexedDbRepository("FinancialAccount", ENTITY_STORE.FinancialAccount, storage),
    categories: new IndexedDbRepository(
      "FinancialCategory",
      ENTITY_STORE.FinancialCategory,
      storage,
    ),
    payees: new IndexedDbRepository("Payee", ENTITY_STORE.Payee, storage),
    transactions: new IndexedDbRepository(
      "FinancialTransaction",
      ENTITY_STORE.FinancialTransaction,
      storage,
    ),
    transfers: new IndexedDbRepository(
      "FinancialTransfer",
      ENTITY_STORE.FinancialTransfer,
      storage,
    ),
    obligations: new IndexedDbRepository(
      "FinancialObligation",
      ENTITY_STORE.FinancialObligation,
      storage,
    ),
    payments: new IndexedDbRepository("FinancialPayment", ENTITY_STORE.FinancialPayment, storage),
    statements: new IndexedDbRepository(
      "CreditCardStatement",
      ENTITY_STORE.CreditCardStatement,
      storage,
    ),
    schedules: new IndexedDbRepository(
      "FinancialSchedule",
      ENTITY_STORE.FinancialSchedule,
      storage,
    ),
    captureProposals: new IndexedDbRepository(
      "FinanceCaptureProposal",
      "finance_capture_proposals",
      storage,
    ),
    importBatches: new IndexedDbRepository("FinanceImportBatch", "finance_import_batches", storage),
    importRows: new IndexedDbRepository("ImportRowProposal", "finance_import_rows", storage),
    reconciliationSessions: new IndexedDbRepository(
      "ReconciliationSession",
      "reconciliation_sessions",
      storage,
    ),
    expectedCashflowItems: new IndexedDbRepository("ExpectedCashflowItem", "expected_cashflow_items", storage),
    budgets: new IndexedDbRepository("Budget", "budgets", storage),
    budgetAllocations: new IndexedDbRepository("BudgetAllocation", "budget_allocations", storage),
    financialGoals: new IndexedDbRepository("FinancialGoal", "financial_goals", storage),
  };
}

export function createFinancePersistence(storage: CanonicalStorage = canonicalStorage) {
  const repositories = createFinanceRepositories(storage);
  return {
    repositories,
    async saveBook(book: FinanceBook) {
      await repositories.books.save(book);
    },
    async saveInstitution(institution: FinancialInstitution) {
      await repositories.institutions.save(institution);
    },
    async saveAccount(account: FinancialAccount) {
      if (!(await repositories.books.get(account.financeBookId)))
        throw new CanonicalPersistenceError(
          "Hesabın FinanceBook kaydı yok.",
          "RELATIONSHIP_MISSING",
        );
      if (account.institutionId && !(await repositories.institutions.get(account.institutionId)))
        throw new CanonicalPersistenceError("Hesabın kurum kaydı yok.", "RELATIONSHIP_MISSING");
      await repositories.accounts.save(account);
    },
    async saveCategory(category: FinancialCategory) {
      if (!(await repositories.books.get(category.financeBookId)))
        throw new CanonicalPersistenceError(
          "Kategorinin FinanceBook kaydı yok.",
          "RELATIONSHIP_MISSING",
        );
      if (category.parentId) {
        const parent = await repositories.categories.get(category.parentId);
        if (!parent || parent.financeBookId !== category.financeBookId)
          throw new CanonicalPersistenceError(
            "Kategori üst ilişkisi geçersiz.",
            "RELATIONSHIP_MISSING",
          );
      }
      await repositories.categories.save(category);
    },
    async savePayee(payee: Payee) {
      if (!(await repositories.books.get(payee.financeBookId)))
        throw new CanonicalPersistenceError(
          "Alacaklının FinanceBook kaydı yok.",
          "RELATIONSHIP_MISSING",
        );
      await repositories.payees.save(payee);
    },
    async saveTransaction(transaction: FinancialTransaction) {
      const account = await repositories.accounts.get(transaction.accountId);
      if (!account || account.financeBookId !== transaction.financeBookId)
        throw new CanonicalPersistenceError(
          "İşlemin hesabı aynı FinanceBook içinde değil.",
          "RELATIONSHIP_MISSING",
        );
      validateMoney(transaction.amount);
      if (transaction.categoryId) {
        const category = await repositories.categories.get(transaction.categoryId);
        if (!category || category.financeBookId !== transaction.financeBookId)
          throw new CanonicalPersistenceError(
            "İşlemin kategorisi geçersiz.",
            "RELATIONSHIP_MISSING",
          );
      }
      if (transaction.payeeId) {
        const payee = await repositories.payees.get(transaction.payeeId);
        if (!payee || payee.financeBookId !== transaction.financeBookId)
          throw new CanonicalPersistenceError("İşlemin alıcısı geçersiz.", "RELATIONSHIP_MISSING");
      }
      for (const split of transaction.splits ?? []) validateMoney(split.amount);
      await repositories.transactions.save(transaction);
    },
    async saveTransfer(transfer: FinancialTransfer) {
      const [source, destination] = await Promise.all([
        repositories.accounts.get(transfer.sourceAccountId),
        repositories.accounts.get(transfer.destinationAccountId),
      ]);
      if (
        !source ||
        !destination ||
        source.financeBookId !== transfer.financeBookId ||
        destination.financeBookId !== transfer.financeBookId
      )
        throw new CanonicalPersistenceError(
          "Transfer hesapları aynı FinanceBook içinde değil.",
          "RELATIONSHIP_MISSING",
        );
      const [sourceTransaction, destinationTransaction] = await Promise.all([
        repositories.transactions.get(transfer.sourceTransactionId),
        repositories.transactions.get(transfer.destinationTransactionId),
      ]);
      if (
        !sourceTransaction ||
        !destinationTransaction ||
        sourceTransaction.financeBookId !== transfer.financeBookId ||
        destinationTransaction.financeBookId !== transfer.financeBookId
      )
        throw new CanonicalPersistenceError(
          "Transfer işlemleri eksik veya farklı FinanceBook içinde.",
          "RELATIONSHIP_MISSING",
        );
      validateMoney(transfer.amount);
      await repositories.transfers.save(transfer);
    },
    async saveObligation(obligation: FinancialObligation) {
      if (!(await repositories.books.get(obligation.financeBookId)))
        throw new CanonicalPersistenceError(
          "Borç kaydının FinanceBook kaydı yok.",
          "RELATIONSHIP_MISSING",
        );
      if (obligation.accountId) {
        const account = await repositories.accounts.get(obligation.accountId);
        if (!account || account.financeBookId !== obligation.financeBookId)
          throw new CanonicalPersistenceError("Borç hesabı geçersiz.", "RELATIONSHIP_MISSING");
      }
      if (obligation.statementId) {
        const statement = await repositories.statements.get(obligation.statementId);
        if (!statement || statement.financeBookId !== obligation.financeBookId)
          throw new CanonicalPersistenceError("Borç ekstresi geçersiz.", "RELATIONSHIP_MISSING");
      }
      validateMoney(obligation.amountDue);
      if (obligation.minimumAmount) validateMoney(obligation.minimumAmount);
      await repositories.obligations.save(obligation);
    },
    async savePayment(payment: FinancialPayment) {
      const obligation = await repositories.obligations.get(payment.obligationId);
      if (!obligation || obligation.financeBookId !== payment.financeBookId)
        throw new CanonicalPersistenceError(
          "Ödemenin borç ilişkisi geçersiz.",
          "RELATIONSHIP_MISSING",
        );
      if (payment.fromAccountId) {
        const account = await repositories.accounts.get(payment.fromAccountId);
        if (!account || account.financeBookId !== payment.financeBookId)
          throw new CanonicalPersistenceError("Ödeme hesabı geçersiz.", "RELATIONSHIP_MISSING");
      }
      validateMoney(payment.amount);
      await repositories.payments.save(payment);
    },
    async saveStatement(statement: CreditCardStatement) {
      const account = await repositories.accounts.get(statement.cardAccountId);
      if (
        !account ||
        account.financeBookId !== statement.financeBookId ||
        account.type !== "CREDIT_CARD"
      )
        throw new CanonicalPersistenceError(
          "Ekstre kredi kartı hesabıyla eşleşmiyor.",
          "RELATIONSHIP_MISSING",
        );
      validateMoney(statement.newBalance);
      await repositories.statements.save(statement);
    },
    async saveSchedule(schedule: FinancialSchedule) {
      if (!(await repositories.books.get(schedule.financeBookId)))
        throw new CanonicalPersistenceError(
          "Takvimin FinanceBook kaydı yok.",
          "RELATIONSHIP_MISSING",
        );
      await repositories.schedules.save(schedule);
    },
    async saveExpectedCashflowItem(item: ExpectedCashflowItem) {
      if (!(await repositories.books.get(item.financeBookId)))
        throw new CanonicalPersistenceError("Beklenen nakit akışının FinanceBook kaydı yok.", "RELATIONSHIP_MISSING");
      if (item.accountId) {
        const account = await repositories.accounts.get(item.accountId);
        if (!account || account.financeBookId !== item.financeBookId)
          throw new CanonicalPersistenceError("Beklenen nakit akışının hesabı geçersiz.", "RELATIONSHIP_MISSING");
      }
      validateMoney(item.amount);
      await repositories.expectedCashflowItems.save(item);
    },
    async saveBudget(budget: Budget) {
      if (!(await repositories.books.get(budget.financeBookId)))
        throw new CanonicalPersistenceError("Bütçenin FinanceBook kaydı yok.", "RELATIONSHIP_MISSING");
      await repositories.budgets.save(budget);
    },
    async saveBudgetAllocation(allocation: BudgetAllocation) {
      const budget = await repositories.budgets.get(allocation.budgetId);
      if (!budget || budget.financeBookId !== allocation.financeBookId)
        throw new CanonicalPersistenceError("Bütçe tahsisinin bütçe ilişkisi geçersiz.", "RELATIONSHIP_MISSING");
      if (allocation.categoryId) {
        const category = await repositories.categories.get(allocation.categoryId);
        if (!category || category.financeBookId !== allocation.financeBookId)
          throw new CanonicalPersistenceError("Bütçe kategorisi geçersiz.", "RELATIONSHIP_MISSING");
      }
      validateMoney(allocation.amount);
      await repositories.budgetAllocations.save(allocation);
    },
    async saveFinancialGoal(goal: FinancialGoal) {
      if (!(await repositories.books.get(goal.financeBookId)))
        throw new CanonicalPersistenceError("Finansal hedefin FinanceBook kaydı yok.", "RELATIONSHIP_MISSING");
      for (const accountId of goal.linkedAccountIds ?? []) {
        const account = await repositories.accounts.get(accountId);
        if (!account || account.financeBookId !== goal.financeBookId)
          throw new CanonicalPersistenceError("Finansal hedef hesabı geçersiz.", "RELATIONSHIP_MISSING");
      }
      validateMoney(goal.targetAmount);
      if (goal.manualCurrentAmount) validateMoney(goal.manualCurrentAmount);
      await repositories.financialGoals.save(goal);
    },
    async listAccounts(financeBookId: string) {
      return (await repositories.accounts.list()).filter(
        (value) => value.financeBookId === financeBookId,
      );
    },
    async listCategories(financeBookId: string) {
      return (await repositories.categories.list()).filter(
        (value) => value.financeBookId === financeBookId,
      );
    },
    async listPayees(financeBookId: string) {
      return (await repositories.payees.list()).filter(
        (value) => value.financeBookId === financeBookId,
      );
    },
    async listTransactions(financeBookId: string) {
      return (await repositories.transactions.list()).filter(
        (value) => value.financeBookId === financeBookId,
      );
    },
    async listObligations(financeBookId: string) {
      return (await repositories.obligations.list()).filter(
        (value) => value.financeBookId === financeBookId,
      );
    },
    async listPayments(financeBookId: string) {
      return (await repositories.payments.list()).filter(
        (value) => value.financeBookId === financeBookId,
      );
    },
    async listStatements(financeBookId: string) {
      return (await repositories.statements.list()).filter(
        (value) => value.financeBookId === financeBookId,
      );
    },
    async listExpectedCashflowItems(financeBookId: string) {
      return (await repositories.expectedCashflowItems.list()).filter((value) => value.financeBookId === financeBookId);
    },
    async listBudgets(financeBookId: string) {
      return (await repositories.budgets.list()).filter((value) => value.financeBookId === financeBookId);
    },
    async listBudgetAllocations(budgetId: string) {
      return (await repositories.budgetAllocations.list()).filter((value) => value.budgetId === budgetId);
    },
    async listFinancialGoals(financeBookId: string) {
      return (await repositories.financialGoals.list()).filter((value) => value.financeBookId === financeBookId);
    },
  };
}
