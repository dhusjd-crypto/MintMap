import { createMoney, type CurrencyCode } from "@/domain/finance";
import { parseMoneyInput } from "./money-input";

export type ImportFormat = "CSV" | "OFX" | "QFX" | "QIF" | "CAMT";
export type ParsedImportRow = {
  index: number;
  date?: number;
  amount?: ReturnType<typeof createMoney>;
  description?: string;
  reference?: string;
  externalId?: string;
  warnings: string[];
  metadata: Record<string, unknown>;
};

const dateFromCompact = (value = "") => {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? Date.parse(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`) : undefined;
};
const xmlValue = (source: string, name: string) =>
  source.match(new RegExp(`<${name}[^>]*>([^<]+)`, "i"))?.[1]?.trim();
const money = (value: string | undefined, currency: CurrencyCode) => {
  if (!value) return undefined;
  const raw = value.trim().replace(/^\+/, "");
  const negative = raw.startsWith("-");
  const unsigned = raw.replace(/^-/, "");
  // OFX/CAMT commonly use a dot decimal; user-facing parsing remains Turkish-first.
  const normalized = unsigned.includes(",") ? unsigned : unsigned.replace(".", ",");
  const parsed = parseMoneyInput(normalized, currency);
  return negative ? { ...parsed, minorUnits: -parsed.minorUnits } : parsed;
};

export function detectImportFormat(name: string, content: string): ImportFormat | undefined {
  const lower = name.toLowerCase();
  if (/<(?:OFX|ofx)>|OFXHEADER:/i.test(content) || /\.(ofx|qfx)$/i.test(lower))
    return lower.endsWith(".qfx") ? "QFX" : "OFX";
  if (/<(?:Document|BkToCstmrStmt|Stmt)>/i.test(content) && /camt\.0?53|camt\.0?52/i.test(content))
    return "CAMT";
  if (/^!Type:/im.test(content) || /\.qif$/i.test(lower)) return "QIF";
  if (/\.csv$/i.test(lower) || /[,;]/.test(content.split(/\r?\n/, 1)[0] ?? "")) return "CSV";
  return undefined;
}

export function parseOfx(content: string, defaultCurrency: CurrencyCode): ParsedImportRow[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ?? [];
  if (!blocks.length) throw new Error("OFX_PARSE_ERROR");
  return blocks.map((block, index) => ({
    index,
    date: dateFromCompact(xmlValue(block, "DTPOSTED")),
    amount: money(xmlValue(block, "TRNAMT"), defaultCurrency),
    description:
      [xmlValue(block, "NAME"), xmlValue(block, "MEMO")].filter(Boolean).join(" · ") || undefined,
    reference: xmlValue(block, "CHECKNUM"),
    externalId: xmlValue(block, "FITID"),
    warnings: [],
    metadata: { parser: "OFX_QFX_V1" },
  }));
}

export function parseQif(content: string, currency: CurrencyCode): ParsedImportRow[] {
  const withoutHeader = content.replace(/^!Type:[^\r\n]*(?:\r?\n)?/im, "");
  const blocks = withoutHeader
    .split(/^\^$/m)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!blocks.length) throw new Error("QIF_PARSE_ERROR");
  return blocks.map((block, index) => {
    const values = Object.fromEntries(
      block.split(/\r?\n/).map((line) => [line[0], line.slice(1).trim()]),
    );
    const date = values.D?.match(/^(\d{1,2})[/'-](\d{1,2})[/'-](\d{2,4})$/);
    const year = date ? (date[3].length === 2 ? `20${date[3]}` : date[3]) : undefined;
    return {
      index,
      date: date
        ? Date.parse(`${year}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}T12:00:00Z`)
        : undefined,
      amount: money(values.T, currency),
      description: [values.P, values.M].filter(Boolean).join(" · ") || undefined,
      reference: values.N,
      warnings: ["WEAK_EXTERNAL_ID"],
      metadata: { parser: "QIF_V1", category: values.L },
    };
  });
}

export function parseCamt(content: string, defaultCurrency: CurrencyCode): ParsedImportRow[] {
  if (!/<(?:Ntry|ntry)>/i.test(content)) throw new Error("UNSUPPORTED_CAMT_VARIANT");
  const entries = content.match(/<Ntry[\s\S]*?<\/Ntry>/gi) ?? [];
  if (!entries.length) throw new Error("CAMT_PARSE_ERROR");
  return entries.map((entry, index) => {
    const amountText = xmlValue(entry, "Amt");
    const currency = (entry.match(/<Amt[^>]*Ccy="(TRY|USD|EUR)"/i)?.[1]?.toUpperCase() ??
      defaultCurrency) as CurrencyCode;
    const indicator = xmlValue(entry, "CdtDbtInd");
    const parsed = money(amountText, currency);
    const negative = indicator === "DBIT";
    return {
      index,
      date: dateFromCompact(xmlValue(entry, "Dt")?.replace(/-/g, "")),
      amount: parsed && {
        ...parsed,
        minorUnits: negative ? -Math.abs(parsed.minorUnits) : Math.abs(parsed.minorUnits),
      },
      description:
        [xmlValue(entry, "Nm"), xmlValue(entry, "Ustrd")].filter(Boolean).join(" · ") || undefined,
      reference: xmlValue(entry, "AcctSvcrRef") ?? xmlValue(entry, "NtryRef"),
      externalId: xmlValue(entry, "NtryRef"),
      warnings:
        indicator === "CRDT" || indicator === "DBIT" ? [] : ["INVALID_CREDIT_DEBIT_INDICATOR"],
      metadata: { parser: "CAMT_V1", creditDebit: indicator },
    };
  });
}

export function parseStructuredImport(
  content: string,
  format: Exclude<ImportFormat, "CSV">,
  currency: CurrencyCode,
) {
  if (format === "OFX" || format === "QFX") return parseOfx(content, currency);
  if (format === "QIF") return parseQif(content, currency);
  return parseCamt(content, currency);
}
