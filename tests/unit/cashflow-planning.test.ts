import { describe, expect, it } from "vitest";
import { createCashflowPlanningApplication } from "@/application/finance/cashflow-planning";
import { createFinanceApplication } from "@/application/finance/finance-application";
import { createFinanceTriggerApplication } from "@/application/finance/triggers";
import { fixedClock } from "@/lib/architecture/clock";
import { createFinancePersistence } from "@/lib/canonical-persistence/repositories";
import { InMemoryCanonicalStorage } from "@/lib/canonical-persistence/storage";
import { createMoney } from "@/domain/finance";

const now = Date.parse("2026-08-14T12:00:00Z");
const money = (minorUnits: number) => createMoney(minorUnits, "TRY");

describe("cashflow, budgets and financial goals", () => {
  it("forecasts outstanding obligations without scheduled-payment duplication and activates FIN-T15", async () => {
    const persistence = createFinancePersistence(new InMemoryCanonicalStorage());
    const clock = fixedClock(now);
    const finance = createFinanceApplication({ persistence, clock });
    const planning = createCashflowPlanningApplication({ persistence, clock });
    const book = await finance.commands.createBook({ name: "Kişisel", type: "PERSONAL", baseCurrency: "TRY" });
    const bank = await finance.commands.createAccount({ financeBookId: book.id, name: "Banka", type: "BANK", currency: "TRY" });
    const card = await finance.commands.createAccount({ financeBookId: book.id, name: "Kart", type: "CREDIT_CARD", currency: "TRY" });
    await finance.commands.createTransaction({ financeBookId: book.id, accountId: bank.id, date: now, amount: money(100_000), intent: "INCOME" });
    const obligation = await finance.commands.createObligation({ financeBookId: book.id, type: "CREDIT_CARD", title: "Ekstre", accountId: card.id, dueDate: now + 2 * 86_400_000, amountDue: money(130_000) });
    await finance.commands.schedulePayment({ obligationId: obligation.id, amount: money(30_000), fromAccountId: bank.id, scheduledFor: now + 86_400_000 });
    const forecast = await planning.queries.cashflow(book.id, { currency: "TRY", horizonDays: 7 });
    expect(forecast.totalOutflows.minorUnits).toBe(130_000);
    expect(forecast.shortfallAmount.minorUnits).toBe(30_000);
    expect((await createFinanceTriggerApplication({ persistence, clock, config: { timezone: "UTC" } }).evaluate(book.id)).evaluations.find((item) => item.triggerId === "FIN-T15")?.status).toBe("TRIGGERED");
  });

  it("keeps internal liquid transfers out of consolidated cash and budget actuals", async () => {
    const persistence = createFinancePersistence(new InMemoryCanonicalStorage());
    const clock = fixedClock(now);
    const finance = createFinanceApplication({ persistence, clock });
    const planning = createCashflowPlanningApplication({ persistence, clock });
    const book = await finance.commands.createBook({ name: "Kişisel", type: "PERSONAL", baseCurrency: "TRY" });
    const first = await finance.commands.createAccount({ financeBookId: book.id, name: "Banka", type: "BANK", currency: "TRY" });
    const second = await finance.commands.createAccount({ financeBookId: book.id, name: "Nakit", type: "CASH", currency: "TRY" });
    await finance.commands.createTransaction({ financeBookId: book.id, accountId: first.id, date: now, amount: money(100_000), intent: "INCOME" });
    await finance.commands.createTransfer({ financeBookId: book.id, sourceAccountId: first.id, destinationAccountId: second.id, amount: money(40_000), date: now });
    expect((await planning.queries.cashflow(book.id, { currency: "TRY", horizonDays: 7 })).openingCash.minorUnits).toBe(100_000);
    const budget = await planning.commands.createBudget({ financeBookId: book.id, name: "Ağustos", periodType: "MONTHLY", startDate: now - 1, endDate: now + 30 * 86_400_000, currency: "TRY" });
    await planning.commands.setBudgetAllocation({ budgetId: budget.id, financeBookId: book.id, amount: money(200_000) });
    expect((await planning.queries.budgetPerformance(budget.id)).totalActual.minorUnits).toBe(0);
  });

  it("counts an uncategorized expense once for a general budget allocation", async () => {
    const persistence = createFinancePersistence(new InMemoryCanonicalStorage());
    const clock = fixedClock(now);
    const finance = createFinanceApplication({ persistence, clock });
    const planning = createCashflowPlanningApplication({ persistence, clock });
    const book = await finance.commands.createBook({ name: "Kişisel", type: "PERSONAL", baseCurrency: "TRY" });
    const card = await finance.commands.createAccount({ financeBookId: book.id, name: "Kart", type: "CREDIT_CARD", currency: "TRY" });
    await finance.commands.createTransaction({ financeBookId: book.id, accountId: card.id, date: now, amount: money(5_000), intent: "EXPENSE" });
    const budget = await planning.commands.createBudget({ financeBookId: book.id, name: "Ağustos", periodType: "MONTHLY", startDate: now - 1, endDate: now + 30 * 86_400_000, currency: "TRY" });
    await planning.commands.setBudgetAllocation({ budgetId: budget.id, financeBookId: book.id, amount: money(20_000) });
    expect((await planning.queries.budgetPerformance(budget.id)).totalActual.minorUnits).toBe(5_000);
  });

  it("uses linked reserve balances for goal progress and keeps books isolated", async () => {
    const persistence = createFinancePersistence(new InMemoryCanonicalStorage());
    const clock = fixedClock(now);
    const finance = createFinanceApplication({ persistence, clock });
    const planning = createCashflowPlanningApplication({ persistence, clock });
    const personal = await finance.commands.createBook({ name: "Kişisel", type: "PERSONAL", baseCurrency: "TRY" });
    const business = await finance.commands.createBook({ name: "İş", type: "BUSINESS", baseCurrency: "TRY" });
    const reserve = await finance.commands.createAccount({ financeBookId: personal.id, name: "Rezerv", type: "BANK", currency: "TRY" });
    await finance.commands.createTransaction({ financeBookId: personal.id, accountId: reserve.id, date: now, amount: money(250_000), intent: "INCOME" });
    const goal = await planning.commands.createFinancialGoal({ financeBookId: personal.id, name: "Fon", type: "EMERGENCY_FUND", targetAmount: money(1_000_000), currentAmountMode: "LINKED_ACCOUNT_SUM", linkedAccountIds: [reserve.id] });
    expect((await planning.queries.goalProgress(goal.id)).percentage).toBe(25);
    expect(await planning.queries.goals(business.id)).toHaveLength(0);
  });

  it("does not convert another currency into a linked-account goal", async () => {
    const persistence = createFinancePersistence(new InMemoryCanonicalStorage());
    const clock = fixedClock(now);
    const finance = createFinanceApplication({ persistence, clock });
    const planning = createCashflowPlanningApplication({ persistence, clock });
    const book = await finance.commands.createBook({ name: "Kişisel", type: "PERSONAL", baseCurrency: "TRY" });
    const tryReserve = await finance.commands.createAccount({ financeBookId: book.id, name: "TRY Rezerv", type: "BANK", currency: "TRY" });
    const usdReserve = await finance.commands.createAccount({ financeBookId: book.id, name: "USD Rezerv", type: "BANK", currency: "USD" });
    await finance.commands.createTransaction({ financeBookId: book.id, accountId: tryReserve.id, date: now, amount: money(250_000), intent: "INCOME" });
    await finance.commands.createTransaction({ financeBookId: book.id, accountId: usdReserve.id, date: now, amount: createMoney(10_000, "USD"), intent: "INCOME" });
    const goal = await planning.commands.createFinancialGoal({ financeBookId: book.id, name: "Fon", type: "EMERGENCY_FUND", targetAmount: money(1_000_000), currentAmountMode: "LINKED_ACCOUNT_SUM", linkedAccountIds: [tryReserve.id, usdReserve.id] });
    expect((await planning.queries.goalProgress(goal.id)).current.minorUnits).toBe(250_000);
  });
});
