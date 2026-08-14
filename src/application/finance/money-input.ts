import { createMoney, type CurrencyCode, type Money } from "@/domain/finance";

export function parseMoneyInput(input: string, currency: CurrencyCode): Money {
  const value = input.trim().replace(/\s/g, "");
  if (!value) throw new Error("Tutar boş olamaz.");
  if (value.startsWith("-")) throw new Error("Tutarı pozitif gir; işlem türü yönü belirler.");
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(value))
    throw new Error("Tutar biçimi geçersiz.");
  const [whole, decimal = ""] = value.replace(/\./g, "").split(",");
  const minorUnits = Number(whole) * 100 + Number(decimal.padEnd(2, "0") || "0");
  return createMoney(minorUnits, currency);
}

export function formatMoney(value: Money): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: value.currency }).format(
    value.minorUnits / 100,
  );
}
