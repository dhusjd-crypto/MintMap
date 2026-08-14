import { describe, expect, it } from "vitest";
import { createFinanceApplication } from "@/application/finance/finance-application";
import { parseMoneyInput } from "@/application/finance/money-input";
import { fixedClock } from "@/lib/architecture/clock";
import { InMemoryCanonicalStorage } from "@/lib/canonical-persistence/storage";
import { createFinancePersistence } from "@/lib/canonical-persistence/repositories";

describe("Finance application workflows", () => {
  it("parses Turkish exact money without floating point", () => {
    expect(parseMoneyInput("87.450,37", "TRY").minorUnits).toBe(8_745_037);
    expect(parseMoneyInput("1.250", "TRY").minorUnits).toBe(125_000);
    expect(() => parseMoneyInput("1,234,50", "TRY")).toThrow();
  });

  it("keeps transfer and confirmed payment truth in Finance", async () => {
    const persistence = createFinancePersistence(new InMemoryCanonicalStorage());
    const app = createFinanceApplication({ persistence, clock: fixedClock(1_000) });
    const book = await app.commands.createBook({
      name: "Kişisel",
      type: "PERSONAL",
      baseCurrency: "TRY",
    });
    const bank = await app.commands.createAccount({
      financeBookId: book.id,
      name: "Banka",
      type: "BANK",
      currency: "TRY",
    });
    const card = await app.commands.createAccount({
      financeBookId: book.id,
      name: "Kart",
      type: "CREDIT_CARD",
      currency: "TRY",
    });
    await app.commands.createTransaction({
      financeBookId: book.id,
      accountId: bank.id,
      date: 1_000,
      amount: parseMoneyInput("1000", "TRY"),
      intent: "INCOME",
    });
    const obligation = await app.commands.createObligation({
      financeBookId: book.id,
      type: "CREDIT_CARD",
      title: "Kart ekstresi",
      accountId: card.id,
      dueDate: 10_000,
      amountDue: parseMoneyInput("1000", "TRY"),
      minimumAmount: parseMoneyInput("200", "TRY"),
    });
    const scheduled = await app.commands.schedulePayment({
      obligationId: obligation.id,
      amount: parseMoneyInput("200", "TRY"),
      fromAccountId: bank.id,
      scheduledFor: 2_000,
    });
    expect((await app.queries.overview(book.id)).obligations[0].outstanding.minorUnits).toBe(
      100_000,
    );
    await app.commands.confirmPaymentWithLedger(scheduled.id, 2_000);
    const after = await app.queries.overview(book.id);
    expect(after.obligations[0].outstanding.minorUnits).toBe(80_000);
    expect(after.accounts.find((item) => item.account.id === bank.id)?.balance).toBe(80_000);
    expect(after.accounts.find((item) => item.account.id === card.id)?.balance).toBe(-20_000);
  });
});
