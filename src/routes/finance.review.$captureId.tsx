import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { captureApplication } from "@/application/capture/capture-application";
import { financeApplication } from "@/application/finance/finance-application";
import { financeCaptureImportApplication } from "@/application/finance/capture-import";
import { matchPaymentEvidence } from "@/application/finance/capture-import";
import { parseMoneyInput } from "@/application/finance/money-input";
import {
  extractImageTextLocally,
  extractPdfTextWithFallback,
  interpretStatementText,
} from "@/application/finance/document-extraction";
import { Button } from "@/components/ui/button";
import type { CurrencyCode, FinanceBook, FinancialAccount } from "@/domain/finance";
import type { FinancialPayment } from "@/domain/finance";
import { toast } from "sonner";

const statementFieldNames = ["statementDate", "dueDate", "newBalance", "minimumPayment"];
const paymentFieldNames = ["paymentDate", "paymentAmount", "reference"];

export const Route = createFileRoute("/finance/review/$captureId")({
  component: FinanceReviewPage,
});

function FinanceReviewPage() {
  const { captureId } = Route.useParams();
  const [books, setBooks] = useState<FinanceBook[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [bookId, setBookId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [kind, setKind] = useState<"CREDIT_CARD_STATEMENT" | "PAYMENT_CONFIRMATION">(
    "CREDIT_CARD_STATEMENT",
  );
  const [fields, setFields] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Record<string, string>>({});
  const [proposalId, setProposalId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState<FinancialPayment[]>([]);
  const [paymentId, setPaymentId] = useState("");
  const activeAccount = accounts.find((account) => account.id === accountId);
  const currency = (activeAccount?.currency ?? "TRY") as CurrencyCode;
  useEffect(() => {
    void (async () => {
      const [item, refs, nextBooks, existing] = await Promise.all([
        captureApplication.repository.getItem(captureId),
        captureApplication.repository.listDocumentRefs(captureId),
        financeApplication.queries.books(),
        financeCaptureImportApplication.queries.proposalsForCapture(captureId),
      ]);
      if (!item || !refs[0]) return;
      const content = await captureApplication.repository.getDocumentContent(refs[0].id);
      if (content) setSourceUrl(URL.createObjectURL(content.blob));
      setBooks(nextBooks);
      const proposal = existing.find((value) => value.reviewStatus === "REVIEW_REQUIRED");
      const firstBook = proposal?.financeBookId ?? nextBooks[0]?.id ?? "";
      setBookId(firstBook);
      if (proposal) {
        setKind(
          proposal.documentType === "PAYMENT_CONFIRMATION"
            ? "PAYMENT_CONFIRMATION"
            : "CREDIT_CARD_STATEMENT",
        );
        setProposalId(proposal.id);
        setFields(
          Object.fromEntries(
            Object.entries(proposal.fields).map(([name, value]) => [
              name,
              typeof value === "object" && value && "minorUnits" in value
                ? `${Number(value.minorUnits) / 100}`.replace(".", ",")
                : name.endsWith("Date") && typeof value === "number"
                  ? new Date(value).toISOString().slice(0, 10)
                  : String(value ?? ""),
            ]),
          ),
        );
        setWarnings(proposal.warnings);
        setConfidence(proposal.fieldConfidence);
        setAccountId(proposal.accountCandidateIds[0] ?? "");
      }
      if (firstBook) setAccounts(await financeApplication.queries.accounts(firstBook));
    })();
  }, [captureId]);
  useEffect(() => {
    if (kind !== "PAYMENT_CONFIRMATION" || !bookId) {
      setPayments([]);
      return;
    }
    void financeApplication.queries.payments(bookId).then(setPayments);
  }, [bookId, kind]);
  const runExtraction = async () => {
    const refs = await captureApplication.repository.listDocumentRefs(captureId);
    const ref = refs[0];
    const content = ref && (await captureApplication.repository.getDocumentContent(ref.id));
    if (!ref || !content) return toast.error("Kaynak dosya bulunamadı");
    setBusy(true);
    try {
      const extracted =
        ref.mimeType === "application/pdf"
          ? await extractPdfTextWithFallback(ref.id, await content.blob.arrayBuffer())
          : await extractImageTextLocally(ref.id, content.blob as File);
      const interpreted = interpretStatementText(extracted.text);
      const next: Record<string, string> = {};
      for (const [name, candidate] of Object.entries(interpreted.fields)) {
        next[name] =
          name.endsWith("Date") && typeof candidate.value === "number"
            ? new Date(candidate.value).toISOString().slice(0, 10)
            : typeof candidate.value === "object"
              ? `${candidate.value.minorUnits / 100}`.replace(".", ",")
              : String(candidate.value);
      }
      setFields(next);
      setWarnings([...extracted.warnings, ...interpreted.warnings]);
      setConfidence(
        Object.fromEntries(
          Object.entries(interpreted.fields).map(([name, value]) => [name, value.confidence]),
        ),
      );
      if (bookId) setPayments(await financeApplication.queries.payments(bookId));
      const proposal = await financeCaptureImportApplication.commands.createProposalFromCapture({
        captureItemId: captureId,
        documentType: kind,
        financeBookId: bookId || undefined,
        accountCandidateIds: accountId ? [accountId] : [],
        fields: Object.fromEntries(
          Object.entries(interpreted.fields).map(([name, value]) => [name, value.value]),
        ),
        fieldConfidence: Object.fromEntries(
          Object.entries(interpreted.fields).map(([name, value]) => [name, value.confidence]),
        ),
        warnings: [...extracted.warnings, ...interpreted.warnings],
        extractorVersion: extracted.extractorVersion,
        sourceDocumentId: ref.id,
        metadata: { method: extracted.method },
      });
      setProposalId(proposal.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Metin çıkarılamadı");
    } finally {
      setBusy(false);
    }
  };
  const confirmStatement = async () => {
    if (
      !proposalId ||
      !bookId ||
      !accountId ||
      !fields.statementDate ||
      !fields.dueDate ||
      !fields.newBalance
    )
      return toast.error("Kart, tarihler ve dönem borcu zorunludur.");
    try {
      await financeCaptureImportApplication.commands.confirmStatementProposal(proposalId, {
        financeBookId: bookId,
        cardAccountId: accountId,
        statementDate: dateInputToTimestamp(fields.statementDate),
        dueDate: dateInputToTimestamp(fields.dueDate),
        newBalance: parseMoneyInput(fields.newBalance, currency),
        minimumPayment: fields.minimumPayment
          ? parseMoneyInput(fields.minimumPayment, currency)
          : undefined,
      });
      toast.success("Ekstre kullanıcı onayıyla kaydedildi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ekstre kaydedilemedi");
    }
  };
  const confirmPayment = async () => {
    const payment = payments.find((item) => item.id === paymentId);
    if (!payment) return toast.error("Ödeme kaydını seçmelisin.");
    if (payment.status === "CONFIRMED") return toast.error("Bu ödeme zaten onaylanmış.");
    if (!payment.transactionId)
      return toast.error(
        "Dekontu doğrulamak için önce mevcut transfer/ledger hareketini bu ödemeye bağla.",
      );
    try {
      await financeCaptureImportApplication.commands.confirmPaymentEvidence(proposalId, payment.id);
      toast.success("Dekont, mevcut ödeme kaydını doğruladı");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ödeme onaylanamadı");
    }
  };
  const paymentMatches = matchPaymentEvidence(
    {
      amount: fields.paymentAmount ? parseMoneyInput(fields.paymentAmount, currency) : undefined,
      date: fields.paymentDate ? dateInputToTimestamp(fields.paymentDate) : undefined,
      reference: fields.reference,
    },
    payments,
  );
  const preview = useMemo(
    () =>
      sourceUrl && (
        <iframe
          title="Kaynak belge"
          src={sourceUrl}
          className="h-[48dvh] w-full rounded-xl border"
        />
      ),
    [sourceUrl],
  );
  return (
    <main className="mx-auto grid max-w-6xl gap-5 p-4 pb-24 lg:grid-cols-2">
      <section className="space-y-3">
        <Link to="/capture" className="text-sm text-primary">
          Yakalamalara dön
        </Link>
        <h1 className="text-2xl font-semibold">Finansta incele</h1>
        {preview}
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex gap-2">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
            className="rounded-lg border p-2"
          >
            <option value="CREDIT_CARD_STATEMENT">Kredi kartı ekstresi</option>
            <option value="PAYMENT_CONFIRMATION">Ödeme dekontu</option>
          </select>
          <Button onClick={() => void runExtraction()} disabled={busy}>
            {busy ? "Çıkarılıyor" : "Yerel metni çıkar"}
          </Button>
        </div>
        <select
          value={bookId}
          onChange={(event) => {
            setBookId(event.target.value);
            void financeApplication.queries.accounts(event.target.value).then(setAccounts);
          }}
          className="w-full rounded-lg border p-2"
        >
          <option value="">Finans kitabı</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.name}
            </option>
          ))}
        </select>
        <select
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className="w-full rounded-lg border p-2"
        >
          <option value="">Kart/hesap seç</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {[
          ...(kind === "CREDIT_CARD_STATEMENT" ? statementFieldNames : paymentFieldNames),
          ...Object.keys(fields),
        ]
          .filter((name, index, all) => all.indexOf(name) === index)
          .map((name) => {
            const value = fields[name] ?? "";
            return (
              <label key={name} className="block text-sm">
                <span className="mb-1 block text-muted-foreground">
                  {name} {confidence[name] ? `· ${confidence[name]}` : ""}
                </span>
                <input
                  type={name.endsWith("Date") ? "date" : "text"}
                  value={value}
                  onChange={(event) => setFields({ ...fields, [name]: event.target.value })}
                  className="w-full rounded-lg border p-2"
                />
              </label>
            );
          })}
        {warnings.length > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            İnceleme gerekli: {warnings.join(", ")}
          </p>
        )}
        {kind === "CREDIT_CARD_STATEMENT" && (
          <Button className="w-full" onClick={() => void confirmStatement()} disabled={!proposalId}>
            Ekstreyi onayla
          </Button>
        )}
        {kind === "PAYMENT_CONFIRMATION" && (
          <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
            <p>
              Dekont yalnızca var olan ödeme ve ledger hareketini doğrular; yeni gider oluşturmaz.
            </p>
            <select
              value={paymentId}
              onChange={(event) => setPaymentId(event.target.value)}
              className="w-full rounded-lg border p-2"
            >
              <option value="">Ödeme kaydı seç</option>
              {paymentMatches.map((match) => (
                <option key={match.paymentId} value={match.paymentId}>
                  {match.confidence} · {match.reasonCodes.join(", ")}
                </option>
              ))}
            </select>
            <Button onClick={() => void confirmPayment()} disabled={!paymentId}>
              Bu dekontla ödemeyi onayla
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}

function dateInputToTimestamp(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T12:00:00Z`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Geçerli tarih girilmelidir.");
  return parsed;
}
