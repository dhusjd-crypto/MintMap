import { describe, expect, it } from "vitest";
import { fixedClock } from "../../src/lib/architecture/clock";
import {
  addMoney,
  compareMoney,
  createMoney,
  createFinanceBook,
  createFinancialAccount,
  createTransaction,
  createSplitTransaction,
  createTransfer,
  changeReconciliationState,
  createFinancialObligation,
  schedulePayment,
  recordPayment,
  confirmPayment,
  recalculateObligationStatus,
  getOutstandingAmount,
  isMinimumSatisfied,
  createCreditCardStatement,
  confirmCreditCardStatement,
  linkStatementToObligation,
  markStatementReconciled,
  FinanceDomainError,
  MoneyError,
  type FinancialAccount,
} from "../../src/domain/finance";

const clock = fixedClock(1_000);
const tryMoney = (minorUnits: number) => createMoney(minorUnits, "TRY");

function account(
  id: string,
  bookId = "personal",
  role: FinancialAccount["role"] = "ASSET",
  currency: "TRY" | "USD" = "TRY",
): FinancialAccount {
  return createFinancialAccount(
    {
      id,
      financeBookId: bookId,
      name: id,
      type: role === "LIABILITY" ? "CREDIT_CARD" : "BANK",
      role,
      currency,
    },
    clock,
  );
}

describe("Finance Money", () => {
  it("uses exact minor-unit arithmetic", () => {
    expect(addMoney(tryMoney(87_450_00), tryMoney(250_37))).toEqual(tryMoney(87_700_37));
    expect(compareMoney(tryMoney(-1), tryMoney(0))).toBe(-1);
  });

  it("rejects currency mismatch and unsafe values", () => {
    expect(() => createMoney(1.5, "TRY")).toThrow(MoneyError);
    expect(() => addMoney(tryMoney(1), createMoney(1, "USD"))).toThrow(MoneyError);
  });
});

describe("Finance books and accounts", () => {
  it("keeps personal and business books explicit", () => {
    const personal = createFinanceBook(
      { id: "personal", name: "Kişisel", type: "PERSONAL", baseCurrency: "TRY" },
      clock,
    );
    const business = createFinanceBook(
      { id: "business", name: "İşletme", type: "BUSINESS", baseCurrency: "TRY" },
      clock,
    );
    expect(personal.type).toBe("PERSONAL");
    expect(business.type).toBe("BUSINESS");
    expect(personal.id).not.toBe(business.id);
  });

  it("supports asset/liability accounts and conservative close", () => {
    const asset = account("bank");
    const liability = account("card", "personal", "LIABILITY");
    expect(asset.role).toBe("ASSET");
    expect(liability.role).toBe("LIABILITY");
    expect(asset.closedAt).toBeUndefined();
  });

  it("rejects cross-book account use", () => {
    expect(() =>
      createTransaction(
        { id: "tx", financeBookId: "business", accountId: "bank", date: 1, amount: tryMoney(-100) },
        account("bank", "personal"),
        clock,
      ),
    ).toThrow(FinanceDomainError);
  });
});

describe("Finance transactions and transfers", () => {
  it("uses signed account-relative transaction amounts", () => {
    const tx = createTransaction(
      {
        id: "expense",
        financeBookId: "personal",
        accountId: "bank",
        date: 1,
        amount: tryMoney(-1_000),
      },
      account("bank"),
      clock,
    );
    expect(tx.amount.minorUnits).toBe(-1_000);
  });

  it("requires exact split totals", () => {
    const tx = createTransaction(
      {
        id: "market",
        financeBookId: "personal",
        accountId: "bank",
        date: 1,
        amount: tryMoney(-1_500),
      },
      account("bank"),
      clock,
    );
    const split = createSplitTransaction(
      tx,
      [{ amount: tryMoney(-1_100) }, { amount: tryMoney(-400) }],
      clock,
    );
    expect(split.splits).toHaveLength(2);
    expect(() => createSplitTransaction(tx, [{ amount: tryMoney(-1_100) }], clock)).toThrow(
      FinanceDomainError,
    );
  });

  it("links a same-currency transfer without creating income/expense semantics", () => {
    const transfer = createTransfer(
      {
        id: "transfer-1",
        financeBookId: "personal",
        sourceAccount: account("bank"),
        destinationAccount: account("card", "personal", "LIABILITY"),
        amount: tryMoney(5_000),
        sourceTransactionId: "source-tx",
        destinationTransactionId: "dest-tx",
      },
      clock,
    );
    expect(transfer.sourceTransactionId).toBe("source-tx");
    expect(transfer.destinationTransactionId).toBe("dest-tx");
    expect(() =>
      createTransfer(
        {
          ...transfer,
          sourceAccount: account("bank", "personal", "ASSET", "TRY"),
          destinationAccount: account("bank", "personal", "ASSET", "USD"),
          amount: createMoney(5_000, "TRY"),
        },
        clock,
      ),
    ).toThrow(FinanceDomainError);
  });

  it("moves reconciliation only forward", () => {
    const tx = createTransaction(
      { id: "tx", financeBookId: "personal", accountId: "bank", date: 1, amount: tryMoney(-100) },
      account("bank"),
      clock,
    );
    const reconciled = changeReconciliationState(
      changeReconciliationState(tx, "CLEARED", clock),
      "RECONCILED",
      clock,
    );
    expect(reconciled.status).toBe("RECONCILED");
    expect(() => changeReconciliationState(reconciled, "CLEARED", clock)).toThrow(
      FinanceDomainError,
    );
  });
});

describe("Obligations, payments and statements", () => {
  it("distinguishes scheduled, confirmed and fully paid", () => {
    const obligation = createFinancialObligation(
      {
        id: "ob-1",
        financeBookId: "personal",
        type: "CREDIT_CARD",
        title: "Kart ekstresi",
        dueDate: 5_000,
        amountDue: tryMoney(10_000),
        minimumAmount: tryMoney(2_000),
      },
      clock,
    );
    let payment = schedulePayment(obligation, { id: "pay-1", amount: tryMoney(2_000) }, clock);
    expect(payment.status).toBe("SCHEDULED");
    expect(getOutstandingAmount(obligation, [payment]).minorUnits).toBe(10_000);
    payment = confirmPayment(recordPayment(payment, clock), "tx-1", clock);
    expect(payment.status).toBe("CONFIRMED");
    expect(isMinimumSatisfied(obligation, [payment])).toBe(true);
    expect(recalculateObligationStatus(obligation, [payment], clock).status).toBe("PAYMENT_DUE");
    const second = confirmPayment(
      recordPayment(
        schedulePayment(obligation, { id: "pay-2", amount: tryMoney(8_000) }, clock),
        clock,
      ),
      "tx-2",
      clock,
    );
    expect(recalculateObligationStatus(obligation, [payment, second], clock).status).toBe("PAID");
  });

  it("validates amounts and overdue state", () => {
    expect(() =>
      createFinancialObligation(
        {
          id: "bad",
          financeBookId: "personal",
          type: "TAX",
          title: "Vergi",
          dueDate: 1,
          amountDue: tryMoney(-1),
        },
        clock,
      ),
    ).toThrow(FinanceDomainError);
    const obligation = createFinancialObligation(
      {
        id: "late",
        financeBookId: "personal",
        type: "LOAN",
        title: "Kredi",
        dueDate: 900,
        amountDue: tryMoney(1_000),
      },
      clock,
    );
    expect(recalculateObligationStatus(obligation, [], clock).status).toBe("OVERDUE");
  });

  it("requires reviewed statements before linking and prevents duplicates", () => {
    const statement = createCreditCardStatement(
      {
        id: "statement-1",
        financeBookId: "personal",
        cardAccountId: "card",
        statementDate: 100,
        dueDate: 5_000,
        newBalance: tryMoney(8_745),
        minimumPayment: tryMoney(1_700),
        currency: "TRY",
        sourceType: "PDF",
        extractionConfidence: 0.7,
      },
      clock,
    );
    expect(() => linkStatementToObligation(statement, [], clock)).toThrow(FinanceDomainError);
    const confirmed = confirmCreditCardStatement(statement, clock);
    const obligation = linkStatementToObligation(confirmed, [], clock);
    expect(obligation.accountId).toBe("card");
    expect(linkStatementToObligation(confirmed, [obligation], clock).id).toBe(obligation.id);
    expect(markStatementReconciled(confirmed, clock).reviewStatus).toBe("RECONCILED");
  });
});
