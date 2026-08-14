import { describe, expect, it } from "vitest";
import {
  createCreditCardStatement,
  createFinancialObligation,
  createMoney,
  createFinanceBook,
  schedulePayment,
  type FinancialSchedule,
} from "@/domain/finance";
import { fixedClock } from "@/lib/architecture/clock";
import {
  evaluateFinanceTriggers,
  getRequiredCash,
  generateRecurringObligations,
} from "@/application/finance/triggers";

const now = Date.parse("2026-08-14T09:00:00Z");
const clock = fixedClock(now);
const money = (minorUnits: number) => createMoney(minorUnits, "TRY");
function obligation(
  id: string,
  days: number,
  extra: Partial<ReturnType<typeof createFinancialObligation>> = {},
) {
  return {
    ...createFinancialObligation(
      {
        id,
        financeBookId: "book",
        type: "CREDIT_CARD",
        title: id,
        dueDate: now + days * 86_400_000,
        amountDue: money(10_000),
        minimumAmount: money(2_000),
      },
      clock,
    ),
    ...extra,
  };
}
function context(overrides: Partial<Parameters<typeof evaluateFinanceTriggers>[0]> = {}) {
  return {
    financeBookId: "book",
    now,
    obligations: [],
    payments: [],
    statements: [],
    schedules: [],
    config: { timezone: "UTC" },
    ...overrides,
  };
}
describe("Finance trigger evaluator", () => {
  it("uses a single effective due stage and never invents a date-only hourly cutoff", () => {
    const evaluations = evaluateFinanceTriggers(context({ obligations: [obligation("today", 0)] }));
    expect(
      evaluations
        .filter((item) => item.status === "TRIGGERED" && /^FIN-T0[1-6]$/.test(item.triggerId))
        .map((item) => item.triggerId),
    ).toEqual(["FIN-T04"]);
    expect(evaluations.find((item) => item.triggerId === "FIN-T05")?.status).toBe("NOT_EVALUATED");
  });
  it("suppresses paid and cancelled obligations while scheduled payments remain unpaid", () => {
    const paid = { ...obligation("paid", 0), status: "PAID" as const };
    const cancelled = { ...obligation("cancelled", 0), status: "CANCELLED" as const };
    const open = obligation("open", 0);
    const scheduled = schedulePayment(
      open,
      { id: "payment", amount: money(10_000), scheduledFor: now - 2 * 86_400_000 },
      clock,
    );
    const evaluations = evaluateFinanceTriggers(
      context({ obligations: [paid, cancelled, open], payments: [scheduled] }),
    );
    expect(
      evaluations.some((item) => item.entityId === "paid" && item.status === "TRIGGERED"),
    ).toBe(false);
    expect(
      evaluations.some((item) => item.entityId === "cancelled" && item.status === "TRIGGERED"),
    ).toBe(false);
    expect(
      evaluations.some((item) => item.triggerId === "FIN-T04" && item.entityId === "open"),
    ).toBe(true);
    expect(
      evaluations.some((item) => item.triggerId === "FIN-T10" && item.entityId === "payment"),
    ).toBe(true);
  });
  it("keeps minimum payment, review and missing obligation conditions distinct", () => {
    const open = obligation("open", 3);
    const statement = createCreditCardStatement(
      {
        id: "statement",
        financeBookId: "book",
        cardAccountId: "card",
        statementDate: now,
        dueDate: now + 3 * 86_400_000,
        newBalance: money(10_000),
        currency: "TRY",
        reviewStatus: "CONFIRMED",
      },
      clock,
    );
    const evaluations = evaluateFinanceTriggers(
      context({ obligations: [open], statements: [statement] }),
    );
    expect(
      evaluations.some((item) => item.triggerId === "FIN-T09" && item.status === "TRIGGERED"),
    ).toBe(true);
    expect(
      evaluations.some((item) => item.triggerId === "FIN-T08" && item.status === "TRIGGERED"),
    ).toBe(true);
  });
  it("returns cash requirements per currency and keeps shortfall honest", () => {
    const required = getRequiredCash(
      context({ obligations: [obligation("one", 2), obligation("two", 5)] }),
      7,
    );
    expect(required).toEqual([
      expect.objectContaining({ currency: "TRY", outstanding: money(20_000) }),
    ]);
    expect(
      evaluateFinanceTriggers(context()).find((item) => item.triggerId === "FIN-T15")?.status,
    ).toBe("NOT_EVALUATED");
  });
  it("generates recurring occurrences once with a stable identity", () => {
    const schedule: FinancialSchedule = {
      id: "rent",
      financeBookId: "book",
      name: "Kira",
      type: "RENT",
      recurrence: "MONTHLY",
      startDate: Date.parse("2026-08-31T12:00:00Z"),
      enabled: true,
      createdAt: now,
      updatedAt: now,
      metadata: { template: { amountDueMinorUnits: 50_000, currency: "TRY" } },
    };
    const first = generateRecurringObligations([schedule], [], now, clock, {
      recurrenceLookaheadDays: 60,
    });
    const second = generateRecurringObligations([schedule], first.created, now, clock, {
      recurrenceLookaheadDays: 60,
    });
    expect(first.created.length).toBeGreaterThan(0);
    expect(second.created).toHaveLength(0);
    expect(first.created[0].metadata.recurrenceOccurrenceKey).toContain("rent:");
  });
});
