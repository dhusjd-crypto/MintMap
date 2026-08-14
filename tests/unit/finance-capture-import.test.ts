import { describe, expect, it } from "vitest";
import { createFinanceApplication } from "@/application/finance/finance-application";
import {
  createFinanceCaptureImportApplication,
  matchPaymentEvidence,
  matchImportRow,
  parseCsvRows,
} from "@/application/finance/capture-import";
import {
  imageOcrCapability,
  interpretStatementText,
} from "@/application/finance/document-extraction";
import {
  detectImportFormat,
  parseCamt,
  parseOfx,
  parseQif,
} from "@/application/finance/import-formats";
import { fixedClock } from "@/lib/architecture/clock";
import { createFinancePersistence } from "@/lib/canonical-persistence/repositories";
import { InMemoryCanonicalStorage } from "@/lib/canonical-persistence/storage";

const clock = fixedClock(Date.parse("2026-08-14T09:00:00Z"));
describe("Finance capture, import and reconciliation", () => {
  it("parses Turkish CSV money and explains exact external-id duplicates", () => {
    const rows = parseCsvRows(
      "Tarih;Tutar;Açıklama;ID\n14.08.2026;-1.250,50;Market;abc",
      {
        date: "Tarih",
        amount: "Tutar",
        description: "Açıklama",
        externalId: "ID",
        dateFormat: "DD.MM.YYYY",
      },
      "TRY",
    );
    expect(rows[0].warnings).toEqual([]);
    const matches = matchImportRow(
      { ...rows[0], externalId: "abc" },
      [
        {
          id: "tx",
          accountId: "a",
          amount: { minorUnits: -125050, currency: "TRY" },
          date: rows[0].date!,
          description: "Market",
          metadata: { externalId: "abc" },
        },
      ],
      "a",
    );
    expect(matches[0]).toMatchObject({
      confidence: "EXACT",
      reasonCodes: expect.arrayContaining(["EXACT_EXTERNAL_ID"]),
    });
  });
  it("requires review before statement truth and blocks unbalanced reconciliation", async () => {
    const persistence = createFinancePersistence(new InMemoryCanonicalStorage());
    const finance = createFinanceApplication({ persistence, clock });
    const app = createFinanceCaptureImportApplication({ persistence, clock });
    const book = await finance.commands.createBook({
      name: "Kişisel",
      type: "PERSONAL",
      baseCurrency: "TRY",
    });
    const account = await finance.commands.createAccount({
      financeBookId: book.id,
      name: "Banka",
      type: "BANK",
      currency: "TRY",
    });
    const tx = await finance.commands.createTransaction({
      financeBookId: book.id,
      accountId: account.id,
      date: clock.nowMs(),
      amount: { minorUnits: 10000, currency: "TRY" },
      intent: "INCOME",
    });
    const session = await app.commands.startReconciliation({
      financeBookId: book.id,
      accountId: account.id,
      closingBalance: { minorUnits: 20000, currency: "TRY" },
      transactionIds: [tx.id],
    });
    await expect(app.commands.completeReconciliation(session.id)).rejects.toThrow(
      "RECONCILIATION_DIFFERENCE",
    );
  });
  it("interprets explicit statement labels as proposal-only candidates", () => {
    const proposal = interpretStatementText(
      "Ekstre Tarihi: 01.08.2026\nSon Ödeme Tarihi: 25.08.2026\nDönem Borcu: 87.450,37 TL\nAsgari Ödeme: 17.490,07 TL",
    );
    expect(proposal.fields.newBalance).toMatchObject({
      value: { minorUnits: 8745037, currency: "TRY" },
      confidence: "HIGH",
    });
    expect(proposal.fields.dueDate).toMatchObject({ confidence: "HIGH" });
    expect(imageOcrCapability().supported).toBe(false);
  });
  it("normalizes OFX/QFX, QIF and CAMT into import rows without writing finance truth", () => {
    const ofx = parseOfx(
      "OFXHEADER:100\n<STMTTRN><DTPOSTED>20260814<TRNAMT>-1250.50<FITID>fit-1<NAME>Market<MEMO>Gıda",
      "TRY",
    );
    expect(ofx[0]).toMatchObject({ externalId: "fit-1", amount: { minorUnits: -125050 } });
    const qif = parseQif("!Type:Bank\nD14/08/2026\nT-250,50\nPMarket\n^", "TRY");
    expect(qif[0]).toMatchObject({
      amount: { minorUnits: -25050 },
      warnings: ["WEAK_EXTERNAL_ID"],
    });
    const camt = parseCamt(
      '<Document><Ntry><Amt Ccy="TRY">500.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-08-14</Dt></BookgDt><NtryRef>ref-1</NtryRef><NtryDtls><TxDtls><RmtInf><Ustrd>Fatura</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry></Document>',
      "TRY",
    );
    expect(camt[0]).toMatchObject({ externalId: "ref-1", amount: { minorUnits: -50000 } });
    expect(detectImportFormat("bank.qfx", "OFXHEADER:100")).toBe("QFX");
  });
  it("keeps payment receipt matching as a reviewed candidate", () => {
    const matches = matchPaymentEvidence(
      { amount: { minorUnits: 2000000, currency: "TRY" }, date: clock.nowMs(), reference: "ABC" },
      [
        {
          id: "payment",
          obligationId: "obligation",
          amount: { minorUnits: 2000000, currency: "TRY" },
          paymentReference: "ABC",
          scheduledFor: clock.nowMs(),
        },
      ],
    );
    expect(matches[0]).toMatchObject({ paymentId: "payment", confidence: "EXACT" });
  });
});
