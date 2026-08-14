import { nanoid } from "nanoid";
import { systemClock, type Clock } from "@/lib/architecture/clock";
import {
  createFinancePersistence,
  type FinanceRepositories,
} from "@/lib/canonical-persistence/repositories";
import { taskApplication } from "@/application/task-application";
import {
  confirmCreditCardStatement,
  confirmPayment,
  createCreditCardStatement,
  createFinanceBook,
  createFinancialAccount,
  createFinancialObligation,
  createSplitTransaction,
  createTransaction,
  createTransfer,
  getOutstandingAmount,
  isMinimumSatisfied,
  linkStatementToObligation,
  recalculateObligationStatus,
  recordPayment,
  schedulePayment,
  type AccountType,
  type CreditCardStatement,
  type CurrencyCode,
  type FinancialAccount,
  type FinancialObligation,
  type FinancialPayment,
  type FinancialTransaction,
  type FinanceBook,
  type FinanceBookType,
  type Money,
  type ObligationType,
  type TransactionSplit,
} from "@/domain/finance";

type Persistence = ReturnType<typeof createFinancePersistence>;
export type FinanceApplicationDependencies = { persistence?: Persistence; clock?: Clock };
const roleFor = (type: AccountType): FinancialAccount["role"] =>
  ["CREDIT_CARD", "LOAN"].includes(type) ? "LIABILITY" : "ASSET";

export function createFinanceApplication(deps: FinanceApplicationDependencies = {}) {
  const persistence = deps.persistence ?? createFinancePersistence();
  const clock = deps.clock ?? systemClock;
  const commands = {
    async createBook(input: { name: string; type: FinanceBookType; baseCurrency: CurrencyCode }) {
      const value = createFinanceBook({ id: nanoid(12), ...input }, clock);
      await persistence.saveBook(value);
      return value;
    },
    async createAccount(input: {
      financeBookId: string;
      name: string;
      type: AccountType;
      currency: CurrencyCode;
      maskedIdentifier?: string;
    }) {
      const value = createFinancialAccount(
        { id: nanoid(12), ...input, role: roleFor(input.type) },
        clock,
      );
      await persistence.saveAccount(value);
      return value;
    },
    async createTransaction(input: {
      financeBookId: string;
      accountId: string;
      date: number;
      amount: Money;
      intent: "EXPENSE" | "INCOME" | "OPENING_BALANCE";
      description?: string;
      notes?: string;
      categoryId?: string;
      payeeId?: string;
      splits?: TransactionSplit[];
    }) {
      const account = await persistence.repositories.accounts.get(input.accountId);
      if (!account || account.financeBookId !== input.financeBookId)
        throw new Error("Hesap aktif finans kitabında değil.");
      const sign = input.intent === "EXPENSE" ? -1 : 1;
      const transaction = createTransaction(
        {
          id: nanoid(12),
          ...input,
          amount: { ...input.amount, minorUnits: Math.abs(input.amount.minorUnits) * sign },
          sourceType: "MANUAL",
          metadata: { intent: input.intent },
        },
        account,
        clock,
      );
      const withSplits = input.splits
        ? createSplitTransaction(transaction, input.splits, clock)
        : transaction;
      await persistence.saveTransaction(withSplits);
      return withSplits;
    },
    async createTransfer(input: {
      financeBookId: string;
      sourceAccountId: string;
      destinationAccountId: string;
      amount: Money;
      date: number;
      description?: string;
    }) {
      const [sourceAccount, destinationAccount] = await Promise.all([
        persistence.repositories.accounts.get(input.sourceAccountId),
        persistence.repositories.accounts.get(input.destinationAccountId),
      ]);
      if (!sourceAccount || !destinationAccount) throw new Error("Transfer hesabı bulunamadı.");
      const sourceId = nanoid(12),
        destinationId = nanoid(12);
      const source = createTransaction(
        {
          id: sourceId,
          financeBookId: input.financeBookId,
          accountId: sourceAccount.id,
          date: input.date,
          amount: { ...input.amount, minorUnits: -Math.abs(input.amount.minorUnits) },
          description: input.description,
          transferId: "pending",
          sourceType: "MANUAL",
        },
        sourceAccount,
        clock,
      );
      const destination = createTransaction(
        {
          id: destinationId,
          financeBookId: input.financeBookId,
          accountId: destinationAccount.id,
          date: input.date,
          amount: {
            ...input.amount,
            minorUnits:
              Math.abs(input.amount.minorUnits) *
              (destinationAccount.role === "LIABILITY" ? -1 : 1),
          },
          description: input.description,
          transferId: "pending",
          sourceType: "MANUAL",
        },
        destinationAccount,
        clock,
      );
      const transfer = createTransfer(
        {
          id: nanoid(12),
          financeBookId: input.financeBookId,
          sourceAccount,
          destinationAccount,
          amount: input.amount,
          sourceTransactionId: sourceId,
          destinationTransactionId: destinationId,
        },
        clock,
      );
      await persistence.saveTransaction({ ...source, transferId: transfer.id });
      await persistence.saveTransaction({ ...destination, transferId: transfer.id });
      await persistence.saveTransfer(transfer);
      return transfer;
    },
    async createObligation(input: {
      financeBookId: string;
      type: ObligationType;
      title: string;
      dueDate: number;
      amountDue: Money;
      minimumAmount?: Money;
      accountId?: string;
      paymentAccountId?: string;
    }) {
      const value = createFinancialObligation(
        { id: nanoid(12), ...input, sourceType: "MANUAL" },
        clock,
      );
      await persistence.saveObligation(value);
      return value;
    },
    async createStatement(
      input: Omit<
        CreditCardStatement,
        "id" | "createdAt" | "updatedAt" | "metadata" | "reviewStatus"
      >,
    ) {
      const value = createCreditCardStatement(
        { id: nanoid(12), ...input, reviewStatus: "CONFIRMED", sourceType: "MANUAL" },
        clock,
      );
      await persistence.saveStatement(value);
      return value;
    },
    async createObligationFromStatement(statementId: string) {
      const statement = await persistence.repositories.statements.get(statementId);
      if (!statement) throw new Error("Ekstre bulunamadı.");
      const obligation = linkStatementToObligation(
        confirmCreditCardStatement(statement, clock),
        await persistence.repositories.obligations.list(),
        clock,
      );
      await persistence.saveStatement(confirmCreditCardStatement(statement, clock));
      await persistence.saveObligation(obligation);
      return obligation;
    },
    async schedulePayment(input: {
      obligationId: string;
      amount: Money;
      fromAccountId?: string;
      scheduledFor?: number;
    }) {
      const obligation = await persistence.repositories.obligations.get(input.obligationId);
      if (!obligation) throw new Error("Borç bulunamadı.");
      const value = schedulePayment(obligation, { id: nanoid(12), ...input }, clock);
      await persistence.savePayment(value);
      await refreshObligation(obligation.id);
      return value;
    },
    async submitPayment(paymentId: string) {
      const payment = await persistence.repositories.payments.get(paymentId);
      if (!payment) throw new Error("Ödeme bulunamadı.");
      const value = recordPayment(payment, clock);
      await persistence.savePayment(value);
      return value;
    },
    async confirmPayment(paymentId: string, transactionId: string) {
      const payment = await persistence.repositories.payments.get(paymentId);
      if (!payment) throw new Error("Ödeme bulunamadı.");
      const value = confirmPayment(payment, transactionId, clock);
      await persistence.savePayment(value);
      await refreshObligation(value.obligationId);
      return value;
    },
    async confirmPaymentWithLedger(paymentId: string, date: number) {
      const payment = await persistence.repositories.payments.get(paymentId);
      if (!payment) throw new Error("Ödeme bulunamadı.");
      if (!payment.fromAccountId) throw new Error("Ödemenin çıkacağı hesap seçilmelidir.");
      const fromAccountId = payment.fromAccountId;
      const obligation = await persistence.repositories.obligations.get(payment.obligationId);
      if (!obligation) throw new Error("Borç bulunamadı.");
      const submitted = payment.status === "SCHEDULED" ? recordPayment(payment, clock) : payment;
      if (submitted.status !== "SUBMITTED") throw new Error("Ödeme onaylanabilir durumda değil.");
      await persistence.savePayment(submitted);
      let transactionId: string;
      if (obligation.accountId) {
        const transfer = await commands.createTransfer({
          financeBookId: obligation.financeBookId,
          sourceAccountId: fromAccountId,
          destinationAccountId: obligation.accountId,
          amount: submitted.amount,
          date,
          description: obligation.title,
        });
        transactionId = transfer.sourceTransactionId;
        submitted.transferId = transfer.id;
      } else {
        const transaction = await commands.createTransaction({
          financeBookId: obligation.financeBookId,
          accountId: fromAccountId,
          date,
          amount: submitted.amount,
          intent: "EXPENSE",
          description: obligation.title,
        });
        transactionId = transaction.id;
      }
      const confirmed = confirmPayment(submitted, transactionId, clock);
      await persistence.savePayment(confirmed);
      await refreshObligation(confirmed.obligationId);
      return confirmed;
    },
    async createExecutionTaskForObligation(obligationId: string, nodeId: string) {
      const obligation = await persistence.repositories.obligations.get(obligationId);
      if (!obligation) throw new Error("Borç bulunamadı.");
      const existing = taskApplication.repositories.tasks
        .list()
        .find(
          (record) =>
            record.task.sourceType === "FINANCIAL_OBLIGATION" &&
            record.task.sourceId === obligationId,
        );
      if (existing) return existing;
      return taskApplication.commands.createTask({
        nodeId,
        text: `${obligation.title} öde`,
        extra: {
          dueAt: obligation.dueDate,
          sourceType: "FINANCIAL_OBLIGATION",
          sourceId: obligation.id,
        },
      });
    },
  };
  async function refreshObligation(id: string) {
    const obligation = await persistence.repositories.obligations.get(id);
    if (!obligation) return;
    const payments = (await persistence.repositories.payments.list()).filter(
      (x) => x.obligationId === id,
    );
    await persistence.saveObligation(recalculateObligationStatus(obligation, payments, clock));
  }
  const queries = {
    books: () => persistence.repositories.books.list(),
    accounts: async (bookId: string) =>
      (await persistence.listAccounts(bookId)).filter((x) => !x.archivedAt),
    transactions: async (bookId: string) =>
      (await persistence.listTransactions(bookId)).sort((a, b) => b.date - a.date),
    obligations: async (bookId: string) =>
      (await persistence.listObligations(bookId)).sort((a, b) => a.dueDate - b.dueDate),
    statements: (bookId: string) => persistence.listStatements(bookId),
    payments: (bookId: string) => persistence.listPayments(bookId),
    async overview(bookId: string) {
      const [accounts, transactions, obligations, payments] = await Promise.all([
        this.accounts(bookId),
        this.transactions(bookId),
        this.obligations(bookId),
        this.payments(bookId),
      ]);
      const balances = accounts.map((account) => ({
        account,
        balance: transactions
          .filter((tx) => tx.accountId === account.id)
          .reduce((sum, tx) => sum + tx.amount.minorUnits, 0),
      }));
      const obligationViews = obligations.map((obligation) => ({
        obligation,
        outstanding: getOutstandingAmount(obligation, payments),
        minimumSatisfied: isMinimumSatisfied(obligation, payments),
      }));
      return { accounts: balances, obligations: obligationViews, transactions };
    },
  };
  return { commands, queries, repositories: persistence.repositories };
}
export const financeApplication = createFinanceApplication();
