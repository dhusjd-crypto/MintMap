import { nanoid } from "nanoid";
import { systemClock, type Clock } from "@/lib/architecture/clock";
import { createFinancePersistence } from "@/lib/canonical-persistence/repositories";
import {
  buildCashflowForecast,
  createBudget,
  createBudgetAllocation,
  createExpectedCashflowItem,
  createFinancialGoal,
  createMoney,
  type Budget,
  type BudgetAllocation,
  type CashflowScenario,
  type CurrencyCode,
  type ExpectedCashflowItem,
  type FinancialGoal,
  type Money,
} from "@/domain/finance";

type Persistence = ReturnType<typeof createFinancePersistence>;
type Deps = { persistence?: Persistence; clock?: Clock };

function accountBalances(transactions: Awaited<ReturnType<Persistence["listTransactions"]>>) {
  return new Map(transactions.reduce((entries, transaction) => {
    entries.set(transaction.accountId, (entries.get(transaction.accountId) ?? 0) + transaction.amount.minorUnits);
    return entries;
  }, new Map<string, number>()));
}

export function createCashflowPlanningApplication(deps: Deps = {}) {
  const persistence = deps.persistence ?? createFinancePersistence();
  const clock = deps.clock ?? systemClock;
  const commands = {
    async createExpectedCashflowItem(input: {
      financeBookId: string; title: string; direction: ExpectedCashflowItem["direction"]; amount: Money;
      expectedAt: number; confidence: ExpectedCashflowItem["confidence"]; accountId?: string; recurrence?: string;
    }) {
      const item = createExpectedCashflowItem({ id: nanoid(12), ...input }, clock);
      await persistence.saveExpectedCashflowItem(item);
      return item;
    },
    async updateExpectedCashflowItem(id: string, patch: Partial<ExpectedCashflowItem>) {
      const item = await persistence.repositories.expectedCashflowItems.get(id);
      if (!item) throw new Error("Beklenen nakit akışı bulunamadı.");
      const next = { ...item, ...patch, id: item.id, financeBookId: item.financeBookId, updatedAt: clock.nowMs() };
      await persistence.saveExpectedCashflowItem(next);
      return next;
    },
    async markExpectedCashflowItemRealized(id: string, transactionId: string) {
      return commands.updateExpectedCashflowItem(id, { status: "REALIZED", transactionId });
    },
    async createBudget(input: { financeBookId: string; name: string; periodType: Budget["periodType"]; startDate: number; endDate: number; currency: CurrencyCode; warningThresholds?: number[] }) {
      const budget = createBudget({ id: nanoid(12), ...input, status: "ACTIVE" }, clock);
      await persistence.saveBudget(budget);
      return budget;
    },
    async setBudgetAllocation(input: { budgetId: string; financeBookId: string; categoryId?: string; amount: Money; notes?: string }) {
      const existing = (await persistence.listBudgetAllocations(input.budgetId)).find((allocation) => allocation.categoryId === input.categoryId);
      const allocation = createBudgetAllocation({ id: existing?.id ?? nanoid(12), ...input, createdAt: existing?.createdAt }, clock);
      await persistence.saveBudgetAllocation(allocation);
      return allocation;
    },
    async createFinancialGoal(input: { financeBookId: string; name: string; type: FinancialGoal["type"]; targetAmount: Money; targetDate?: number; currentAmountMode: FinancialGoal["currentAmountMode"]; linkedAccountIds?: string[]; manualCurrentAmount?: Money }) {
      const goal = createFinancialGoal({ id: nanoid(12), ...input, currency: input.targetAmount.currency }, clock);
      await persistence.saveFinancialGoal(goal);
      return goal;
    },
    async updateFinancialGoal(id: string, patch: Partial<FinancialGoal>) {
      const goal = await persistence.repositories.financialGoals.get(id);
      if (!goal) throw new Error("Finansal hedef bulunamadı.");
      const next = { ...goal, ...patch, id: goal.id, financeBookId: goal.financeBookId, updatedAt: clock.nowMs() };
      await persistence.saveFinancialGoal(next);
      return next;
    },
  };
  const queries = {
    expectedCashflowItems: (bookId: string) => persistence.listExpectedCashflowItems(bookId),
    budgets: (bookId: string) => persistence.listBudgets(bookId),
    goals: (bookId: string) => persistence.listFinancialGoals(bookId),
    async cashflow(bookId: string, input: { currency: CurrencyCode; horizonDays: number; scenario?: CashflowScenario; start?: number }) {
      const start = input.start ?? clock.nowMs();
      const [accounts, transactions, obligations, payments, expectedItems] = await Promise.all([
        persistence.listAccounts(bookId), persistence.listTransactions(bookId), persistence.listObligations(bookId),
        persistence.listPayments(bookId), persistence.listExpectedCashflowItems(bookId),
      ]);
      return buildCashflowForecast({ financeBookId: bookId, currency: input.currency, start, end: start + input.horizonDays * 86_400_000, generatedAt: clock.nowMs(), scenario: input.scenario, accounts, transactions, obligations, payments, expectedItems });
    },
    async budgetPerformance(budgetId: string) {
      const budget = await persistence.repositories.budgets.get(budgetId);
      if (!budget) throw new Error("Bütçe bulunamadı.");
      const [allocations, transactions] = await Promise.all([persistence.listBudgetAllocations(budget.id), persistence.listTransactions(budget.financeBookId)]);
      const included = transactions.filter((transaction) => transaction.date >= budget.startDate && transaction.date <= budget.endDate && !transaction.transferId && transaction.amount.currency === budget.currency && transaction.metadata.intent === "EXPENSE");
      const actualFor = (categoryId?: string) => createMoney(Math.abs(included.filter((transaction) => transaction.categoryId === categoryId).reduce((sum, transaction) => sum + transaction.amount.minorUnits, 0)), budget.currency);
      const rows = allocations.map((allocation) => {
        const actual = actualFor(allocation.categoryId);
        return { allocation, actual, remaining: createMoney(allocation.amount.minorUnits - actual.minorUnits, budget.currency), percentage: allocation.amount.minorUnits ? (actual.minorUnits / allocation.amount.minorUnits) * 100 : 0, warnings: budget.warningThresholds.filter((threshold) => actual.minorUnits >= allocation.amount.minorUnits * threshold / 100).map((threshold) => threshold >= 100 ? "BUDGET_EXCEEDED" : "NEAR_BUDGET_LIMIT") };
      });
      const uncategorized = actualFor(undefined);
      return { budget, rows, uncategorized, totalBudgeted: createMoney(allocations.reduce((sum, allocation) => sum + allocation.amount.minorUnits, 0), budget.currency), totalActual: createMoney(rows.reduce((sum, row) => sum + row.actual.minorUnits, 0) + uncategorized.minorUnits, budget.currency) };
    },
    async goalProgress(goalId: string) {
      const goal = await persistence.repositories.financialGoals.get(goalId);
      if (!goal) throw new Error("Finansal hedef bulunamadı.");
      const transactions = await persistence.listTransactions(goal.financeBookId);
      const balances = accountBalances(transactions);
      const linked = (goal.linkedAccountIds ?? []).reduce((sum, accountId) => sum + (balances.get(accountId) ?? 0), 0);
      const current = goal.currentAmountMode === "MANUAL" ? (goal.manualCurrentAmount ?? createMoney(0, goal.currency)) : createMoney(Math.max(0, linked), goal.currency);
      const remaining = createMoney(Math.max(0, goal.targetAmount.minorUnits - current.minorUnits), goal.currency);
      const months = goal.targetDate ? Math.max(1, Math.ceil((goal.targetDate - clock.nowMs()) / (30 * 86_400_000))) : undefined;
      return { goal, current, remaining, percentage: (current.minorUnits / goal.targetAmount.minorUnits) * 100, requiredMonthlySaving: months ? createMoney(Math.ceil(remaining.minorUnits / months), goal.currency) : undefined };
    },
  };
  return { commands, queries };
}

export const cashflowPlanningApplication = createCashflowPlanningApplication();
