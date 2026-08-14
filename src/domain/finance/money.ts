export type CurrencyCode = "TRY" | "USD" | "EUR";

export type Money = {
  minorUnits: number;
  currency: CurrencyCode;
};

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function createMoney(minorUnits: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(minorUnits))
    throw new MoneyError("Para tutarı güvenli bir tam sayı olmalıdır.");
  return { minorUnits, currency };
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency)
    throw new MoneyError("Farklı para birimleri doğrudan karşılaştırılamaz.");
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(left.minorUnits + right.minorUnits, left.currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(left.minorUnits - right.minorUnits, left.currency);
}

export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  assertSameCurrency(left, right);
  return left.minorUnits < right.minorUnits ? -1 : left.minorUnits > right.minorUnits ? 1 : 0;
}

export function isZero(value: Money): boolean {
  return value.minorUnits === 0;
}
export function isPositive(value: Money): boolean {
  return value.minorUnits > 0;
}
export function isNegative(value: Money): boolean {
  return value.minorUnits < 0;
}
export function absoluteMoney(value: Money): Money {
  return createMoney(Math.abs(value.minorUnits), value.currency);
}
