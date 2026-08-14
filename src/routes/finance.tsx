import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, Landmark, Plus, ReceiptText, Send, WalletCards } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { financeApplication } from "@/application/finance/finance-application";
import { cashflowPlanningApplication } from "@/application/finance/cashflow-planning";
import { financeCaptureImportApplication } from "@/application/finance/capture-import";
import { detectImportFormat, type ImportFormat } from "@/application/finance/import-formats";
import { financeTriggerApplication, type FinanceAlertView } from "@/application/finance/triggers";
import { formatMoney, parseMoneyInput } from "@/application/finance/money-input";
import type { Budget, CurrencyCode, FinanceBook, FinancialAccount, FinancialGoal } from "@/domain/finance";
import { toast } from "sonner";

export const Route = createFileRoute("/finance")({
  head: () => ({ meta: [{ title: "Finans — MintMap" }] }),
  component: FinancePage,
});
type Tab = "OVERVIEW" | "ACCOUNTS" | "LEDGER" | "OBLIGATIONS" | "STATEMENTS" | "IMPORT" | "CASHFLOW" | "BUDGETS" | "GOALS";
const dateValue = () => new Date().toISOString().slice(0, 10);
const dateMs = (value: string) => new Date(`${value}T12:00:00`).getTime();

function FinancePage() {
  const isReviewRoute = useRouterState({
    select: (state) => state.location.pathname.startsWith("/finance/review/"),
  });
  const [books, setBooks] = useState<FinanceBook[]>([]);
  const [bookId, setBookId] = useState("");
  const [tab, setTab] = useState<Tab>("OVERVIEW");
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [overview, setOverview] =
    useState<Awaited<ReturnType<typeof financeApplication.queries.overview>>>();
  const [transactions, setTransactions] = useState<
    Awaited<ReturnType<typeof financeApplication.queries.transactions>>
  >([]);
  const [obligations, setObligations] = useState<
    Awaited<ReturnType<typeof financeApplication.queries.obligations>>
  >([]);
  const [statements, setStatements] = useState<
    Awaited<ReturnType<typeof financeApplication.queries.statements>>
  >([]);
  const [alerts, setAlerts] = useState<FinanceAlertView[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const refresh = async (selected = bookId) => {
    const nextBooks = await financeApplication.queries.books();
    setBooks(nextBooks);
    const active = selected || nextBooks[0]?.id || "";
    if (!active) return;
    setBookId(active);
    const [
      nextAccounts,
      nextOverview,
      nextTransactions,
      nextObligations,
      nextStatements,
      triggerResult,
      nextBudgets,
      nextGoals,
    ] = await Promise.all([
      financeApplication.queries.accounts(active),
      financeApplication.queries.overview(active),
      financeApplication.queries.transactions(active),
      financeApplication.queries.obligations(active),
      financeApplication.queries.statements(active),
      financeTriggerApplication.evaluate(active),
      cashflowPlanningApplication.queries.budgets(active),
      cashflowPlanningApplication.queries.goals(active),
    ]);
    setAccounts(nextAccounts);
    setOverview(nextOverview);
    setTransactions(nextTransactions);
    setObligations(nextObligations);
    setStatements(nextStatements);
    setAlerts(triggerResult.alerts);
    setBudgets(nextBudgets);
    setGoals(nextGoals);
  };
  useEffect(() => {
    void refresh();
  }, []);
  const activeBook = books.find((book) => book.id === bookId);
  if (isReviewRoute) return <Outlet />;
  if (!activeBook) return <Setup onCreated={(id) => void refresh(id)} />;
  return (
    <div className="min-h-dvh bg-background pb-24">
      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              MintMap
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Finans</h1>
          </div>
          <select
            value={bookId}
            onChange={(event) => void refresh(event.target.value)}
            className="rounded-lg border bg-card px-3 py-2 text-sm"
          >
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.name} ·{" "}
                {book.type === "PERSONAL" ? "Kişisel" : book.type === "BUSINESS" ? "İş" : "Özel"}
              </option>
            ))}
          </select>
        </header>
        <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
          {(["OVERVIEW", "ACCOUNTS", "LEDGER", "OBLIGATIONS", "STATEMENTS", "IMPORT", "CASHFLOW", "BUDGETS", "GOALS"] as Tab[]).map(
            (item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-sm ${tab === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {
                  (
                    {
                      OVERVIEW: "Özet",
                      ACCOUNTS: "Hesaplar",
                      LEDGER: "İşlemler",
                      OBLIGATIONS: "Ödemeler",
                      STATEMENTS: "Ekstreler",
                      IMPORT: "İçe aktar",
                      CASHFLOW: "Nakit akışı",
                      BUDGETS: "Bütçeler",
                      GOALS: "Hedefler",
                    } as Record<Tab, string>
                  )[item]
                }
              </button>
            ),
          )}
        </nav>
        {tab === "OVERVIEW" && (
          <Overview overview={overview} obligations={obligations} alerts={alerts} />
        )}
        {tab === "ACCOUNTS" && (
          <Accounts book={activeBook} accounts={accounts} onDone={() => void refresh()} />
        )}
        {tab === "LEDGER" && (
          <Ledger
            book={activeBook}
            accounts={accounts}
            transactions={transactions}
            onDone={() => void refresh()}
          />
        )}
        {tab === "OBLIGATIONS" && (
          <Obligations
            book={activeBook}
            accounts={accounts}
            obligations={obligations}
            onDone={() => void refresh()}
          />
        )}
        {tab === "STATEMENTS" && (
          <Statements
            book={activeBook}
            accounts={accounts}
            statements={statements}
            onDone={() => void refresh()}
          />
        )}
        {tab === "IMPORT" && (
          <ImportTransactions book={activeBook} accounts={accounts} onDone={() => void refresh()} />
        )}
        {tab === "CASHFLOW" && <Cashflow book={activeBook} onDone={() => void refresh()} />}
        {tab === "BUDGETS" && <Budgets book={activeBook} budgets={budgets} onDone={() => void refresh()} />}
        {tab === "GOALS" && <Goals book={activeBook} goals={goals} onDone={() => void refresh()} />}
      </main>
      <BottomNav />
    </div>
  );
}
function ImportTransactions({
  book,
  accounts,
  onDone,
}: {
  book: FinanceBook;
  accounts: FinancialAccount[];
  onDone: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] =
    useState<Awaited<ReturnType<typeof financeCaptureImportApplication.commands.createCsvBatch>>>();
  const upload = async (file?: File) => {
    if (!file || !accountId) return;
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    try {
      const text = await file.text();
      const format = detectImportFormat(file.name, text);
      if (!format) throw new Error("UNSUPPORTED_FORMAT");
      const result =
        format === "CSV"
          ? await financeCaptureImportApplication.commands.createCsvBatch({
              financeBookId: book.id,
              accountId,
              filename: file.name,
              csv: text,
              currency: account.currency,
              mapping: {
                date: "Tarih",
                amount: "Tutar",
                description: "Açıklama",
                externalId: "ID",
                dateFormat: "DD.MM.YYYY",
              },
            })
          : await financeCaptureImportApplication.commands.createStructuredImportBatch({
              financeBookId: book.id,
              accountId,
              filename: file.name,
              content: text,
              format: format as Exclude<ImportFormat, "CSV">,
              currency: account.currency,
            });
      setPreview(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dosya ayrıştırılamadı");
    }
  };
  const confirm = async () => {
    if (!preview) return;
    await financeCaptureImportApplication.commands.confirmImportRows(
      preview.batch.id,
      preview.rows.filter((row) => row.decision === "IMPORT_NEW").map((row) => row.id),
    );
    toast.success("Uygun satırlar içe aktarıldı");
    setPreview(undefined);
    onDone();
  };
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4">
      <div>
        <h2 className="font-semibold">Banka dosyasını incele</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dosya önce önerilere ayrılır; onaydan önce finans kayıtları değişmez.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className="rounded-lg border p-3"
        >
          <option value="">Hedef hesap seç</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <label className="inline-flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm font-medium">
          Dosya seç
          <input
            className="hidden"
            type="file"
            accept=".csv,.ofx,.qfx,.qif,.xml,.camt"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </label>
      </div>
      {preview && (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
          <p className="text-sm">
            {preview.batch.format} · {preview.batch.rowCount} satır · {preview.batch.duplicateCount}{" "}
            yinelenen
          </p>
          {preview.rows.slice(0, 8).map((row) => (
            <div key={row.id} className="flex justify-between gap-3 text-sm">
              <span>{row.description ?? "Açıklama yok"}</span>
              <span>
                {row.decision}
                {row.warnings.length ? ` · ${row.warnings.join(", ")}` : ""}
              </span>
            </div>
          ))}
          <Button onClick={() => void confirm()}>Yeni satırları onayla</Button>
        </div>
      )}
    </section>
  );
}
function Setup({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("Kişisel Finans");
  const [type, setType] = useState<FinanceBook["type"]>("PERSONAL");
  const [currency, setCurrency] = useState<CurrencyCode>("TRY");
  const create = async () => {
    try {
      const book = await financeApplication.commands.createBook({
        name,
        type,
        baseCurrency: currency,
      });
      onCreated(book.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kitap oluşturulamadı");
    }
  };
  return (
    <div className="min-h-dvh bg-background px-4 py-12">
      <main className="mx-auto max-w-md rounded-2xl border bg-card p-6">
        <WalletCards className="h-8 w-8 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold">Finansını kur</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Önce bir finans kitabı oluştur. Kişisel ve iş kayıtları birbirinden ayrı kalır.
        </p>
        <input
          className="mt-5 w-full rounded-lg border p-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FinanceBook["type"])}
            className="rounded-lg border p-3"
          >
            <option value="PERSONAL">Kişisel</option>
            <option value="BUSINESS">İş</option>
            <option value="CUSTOM">Özel</option>
          </select>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            className="rounded-lg border p-3"
          >
            <option>TRY</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </div>
        <Button className="mt-4 w-full" onClick={() => void create()}>
          Finans kitabını oluştur
        </Button>
      </main>
    </div>
  );
}
function Overview({
  overview,
  obligations,
  alerts,
}: {
  overview: Awaited<ReturnType<typeof financeApplication.queries.overview>> | undefined;
  obligations: Awaited<ReturnType<typeof financeApplication.queries.obligations>>;
  alerts: FinanceAlertView[];
}) {
  const overdue = obligations.filter((x) => x.status === "OVERDUE");
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {" "}
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Hesaplar</h2>
        <div className="mt-3 space-y-2">
          {overview?.accounts.map(({ account, balance }) => (
            <div key={account.id} className="flex justify-between text-sm">
              <span>
                {account.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {account.role === "LIABILITY" ? "Borç" : "Varlık"}
                </span>
              </span>
              <strong>{formatMoney({ minorUnits: balance, currency: account.currency })}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Yaklaşan ödemeler</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {obligations.filter((x) => !["PAID", "CANCELLED"].includes(x.status)).length} açık
          yükümlülük · {overdue.length} gecikmiş
        </p>
        {overview?.obligations.slice(0, 3).map(({ obligation, outstanding }) => (
          <div key={obligation.id} className="mt-3 flex justify-between text-sm">
            <span>{obligation.title}</span>
            <span>{formatMoney(outstanding)}</span>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border bg-card p-4 md:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Finans uyarıları</h2>
          <span className="text-xs text-muted-foreground">{alerts.length} açık sinyal</span>
        </div>
        {alerts.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {alerts
              .sort(
                (a, b) =>
                  ({ CRITICAL: 3, HIGH: 2, ATTENTION: 1, INFO: 0 })[b.severity] -
                  { CRITICAL: 3, HIGH: 2, ATTENTION: 1, INFO: 0 }[a.severity],
              )
              .slice(0, 6)
              .map((alert) => (
                <div
                  key={`${alert.triggerId}:${alert.entityId}`}
                  className="rounded-xl bg-muted/50 p-3"
                >
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{alert.detail}</p>
                </div>
              ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Şu anda eylem gerektiren finans uyarısı yok.
          </p>
        )}
      </div>
    </section>
  );
}
function Accounts({
  book,
  accounts,
  onDone,
}: {
  book: FinanceBook;
  accounts: FinancialAccount[];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FinancialAccount["type"]>("BANK");
  const create = async () => {
    try {
      await financeApplication.commands.createAccount({
        financeBookId: book.id,
        name,
        type,
        currency: book.baseCurrency,
      });
      setName("");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hesap oluşturulamadı");
    }
  };
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Hesap ekle</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Yapı Kredi"
            className="min-w-48 flex-1 rounded-lg border p-3"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FinancialAccount["type"])}
            className="rounded-lg border p-3"
          >
            {["BANK", "CASH", "CREDIT_CARD", "LOAN", "INVESTMENT", "OTHER"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <Button onClick={() => void create()} disabled={!name.trim()}>
            <Plus />
            Ekle
          </Button>
        </div>
      </div>
      {accounts.map((account) => (
        <div
          key={account.id}
          className="flex items-center justify-between rounded-xl border bg-card p-4"
        >
          <div>
            <strong>{account.name}</strong>
            <p className="text-sm text-muted-foreground">
              {account.type} · {account.role === "LIABILITY" ? "Yükümlülük" : "Varlık"}
            </p>
          </div>
          <Landmark className="h-5 w-5 text-primary" />
        </div>
      ))}
    </section>
  );
}
function Ledger({
  book,
  accounts,
  transactions,
  onDone,
}: {
  book: FinanceBook;
  accounts: FinancialAccount[];
  transactions: Awaited<ReturnType<typeof financeApplication.queries.transactions>>;
  onDone: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [intent, setIntent] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const add = async () => {
    try {
      await financeApplication.commands.createTransaction({
        financeBookId: book.id,
        accountId,
        amount: parseMoneyInput(amount, book.baseCurrency),
        intent,
        date: dateMs(dateValue()),
      });
      setAmount("");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İşlem oluşturulamadı");
    }
  };
  const transfer = async () => {
    try {
      await financeApplication.commands.createTransfer({
        financeBookId: book.id,
        sourceAccountId,
        destinationAccountId,
        amount: parseMoneyInput(transferAmount, book.baseCurrency),
        date: dateMs(dateValue()),
      });
      setTransferAmount("");
      onDone();
      toast.success("Transfer kaydedildi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer oluşturulamadı");
    }
  };
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">İşlem ekle</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="rounded-lg border p-3"
          >
            <option value="">Hesap seç</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value as typeof intent)}
            className="rounded-lg border p-3"
          >
            <option value="EXPENSE">Gider</option>
            <option value="INCOME">Gelir</option>
          </select>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.250,50"
            className="rounded-lg border p-3"
          />
          <Button onClick={() => void add()} disabled={!accountId || !amount}>
            <Plus />
            Kaydet
          </Button>
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Hesaplar arası transfer</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Kredi kartı ödemesi burada Banka → Kart transferidir; yeni bir gider oluşturmaz.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <select
            value={sourceAccountId}
            onChange={(e) => setSourceAccountId(e.target.value)}
            className="rounded-lg border p-3"
          >
            <option value="">Çıkış hesabı</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <select
            value={destinationAccountId}
            onChange={(e) => setDestinationAccountId(e.target.value)}
            className="rounded-lg border p-3"
          >
            <option value="">Varış hesabı</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <input
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            placeholder="Tutar"
            className="rounded-lg border p-3"
          />
          <Button
            variant="outline"
            onClick={() => void transfer()}
            disabled={!sourceAccountId || !destinationAccountId || !transferAmount}
          >
            <Send />
            Transfer
          </Button>
        </div>
      </div>
      {transactions.map((tx) => (
        <div key={tx.id} className="flex justify-between rounded-xl border bg-card p-4 text-sm">
          <span>{tx.description ?? (tx.metadata.intent as string) ?? "Manuel işlem"}</span>
          <strong className={tx.amount.minorUnits < 0 ? "text-red-600" : "text-emerald-600"}>
            {formatMoney(tx.amount)}
          </strong>
        </div>
      ))}
    </section>
  );
}
function Obligations({
  book,
  accounts,
  obligations,
  onDone,
}: {
  book: FinanceBook;
  accounts: FinancialAccount[];
  obligations: Awaited<ReturnType<typeof financeApplication.queries.obligations>>;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(dateValue());
  const create = async () => {
    try {
      await financeApplication.commands.createObligation({
        financeBookId: book.id,
        type: "OTHER",
        title,
        dueDate: dateMs(due),
        amountDue: parseMoneyInput(amount, book.baseCurrency),
      });
      setTitle("");
      setAmount("");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Borç oluşturulamadı");
    }
  };
  const pay = async (id: string) => {
    try {
      const obligation = obligations.find((x) => x.id === id);
      if (!obligation) return;
      const paymentAccount = accounts.find((account) => account.role === "ASSET");
      if (!paymentAccount) throw new Error("Ödeme için önce bir varlık hesabı oluşturmalısın.");
      const payment = await financeApplication.commands.schedulePayment({
        obligationId: id,
        amount: obligation.amountDue,
        fromAccountId: paymentAccount.id,
        scheduledFor: Date.now(),
      });
      await financeApplication.commands.confirmPaymentWithLedger(payment.id, Date.now());
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ödeme işlenemedi");
    }
  };
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Ödeme yükümlülüğü ekle</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn. Kira"
            className="rounded-lg border p-3"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Tutar"
            className="rounded-lg border p-3"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-lg border p-3"
          />
          <Button onClick={() => void create()} disabled={!title || !amount}>
            <Plus />
            Ekle
          </Button>
        </div>
      </div>
      {obligations.map((obligation) => (
        <div key={obligation.id} className="rounded-xl border bg-card p-4">
          <div className="flex justify-between gap-3">
            <div>
              <strong>{obligation.title}</strong>
              <p className="text-sm text-muted-foreground">
                {new Date(obligation.dueDate).toLocaleDateString("tr-TR")} · {obligation.status}
              </p>
            </div>
            <strong>{formatMoney(obligation.amountDue)}</strong>
          </div>
          {!["PAID", "CANCELLED"].includes(obligation.status) && (
            <Button className="mt-3" variant="outline" onClick={() => void pay(obligation.id)}>
              <Send />
              Ödemeyi onayla
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
function Statements({
  book,
  accounts,
  statements,
  onDone,
}: {
  book: FinanceBook;
  accounts: FinancialAccount[];
  statements: Awaited<ReturnType<typeof financeApplication.queries.statements>>;
  onDone: () => void;
}) {
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  const [card, setCard] = useState("");
  const [amount, setAmount] = useState("");
  const create = async () => {
    try {
      const account = accounts.find((a) => a.id === card);
      if (!account) return;
      await financeApplication.commands.createStatement({
        financeBookId: book.id,
        cardAccountId: card,
        statementDate: dateMs(dateValue()),
        dueDate: dateMs(dateValue()),
        newBalance: parseMoneyInput(amount, account.currency),
        currency: account.currency,
      });
      setAmount("");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ekstre oluşturulamadı");
    }
  };
  const obligation = async (id: string) => {
    try {
      await financeApplication.commands.createObligationFromStatement(id);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Borç oluşturulamadı");
    }
  };
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Kredi kartı ekstresi</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={card}
            onChange={(e) => setCard(e.target.value)}
            className="rounded-lg border p-3"
          >
            <option value="">Kart seç</option>
            {cards.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ekstre tutarı"
            className="rounded-lg border p-3"
          />
          <Button onClick={() => void create()} disabled={!card || !amount}>
            <ReceiptText />
            Kaydet
          </Button>
        </div>
      </div>
      {statements.map((statement) => (
        <div
          key={statement.id}
          className="flex items-center justify-between rounded-xl border bg-card p-4"
        >
          <div>
            <strong>{formatMoney(statement.newBalance)}</strong>
            <p className="text-sm text-muted-foreground">{statement.reviewStatus}</p>
          </div>
          <Button variant="outline" onClick={() => void obligation(statement.id)}>
            Borç oluştur
          </Button>
        </div>
      ))}
    </section>
  );
}

function Cashflow({ book, onDone }: { book: FinanceBook; onDone: () => void }) {
  const [horizon, setHorizon] = useState(30);
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<"INFLOW" | "OUTFLOW">("INFLOW");
  const [forecast, setForecast] = useState<Awaited<ReturnType<typeof cashflowPlanningApplication.queries.cashflow>>>();
  const load = async () => setForecast(await cashflowPlanningApplication.queries.cashflow(book.id, { currency: book.baseCurrency, horizonDays: horizon }));
  useEffect(() => { void load(); }, [book.id, horizon]);
  const add = async () => {
    try {
      await cashflowPlanningApplication.commands.createExpectedCashflowItem({ financeBookId: book.id, title, direction, amount: parseMoneyInput(amount, book.baseCurrency), expectedAt: dateMs(dateValue()), confidence: "EXPECTED" });
      setTitle(""); setAmount(""); await load(); onDone();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Nakit akışı kaydedilemedi"); }
  };
  return <section className="space-y-4">
    <div className="rounded-xl border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Nakit akışı</h2><p className="text-sm text-muted-foreground">Likit hesaplar, beklenen girişler ve gerçek yükümlülükler üzerinden hesaplanır.</p></div><select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} className="rounded-lg border p-2">{[7, 14, 30, 90].map((day) => <option key={day} value={day}>{day} gün</option>)}</select></div>
    {forecast && <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm"><Metric label="Açılış" value={formatMoney(forecast.openingCash)} /><Metric label="Kapanış" value={formatMoney(forecast.closingCash)} /><Metric label="En düşük" value={formatMoney(forecast.minimumProjectedCash)} /><Metric label="Açık" value={formatMoney(forecast.shortfallAmount)} /></div>}</div>
    <div className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Beklenen hareket ekle</h2><div className="mt-3 grid gap-2 sm:grid-cols-4"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Örn. Maaş" className="rounded-lg border p-3"/><select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)} className="rounded-lg border p-3"><option value="INFLOW">Beklenen giriş</option><option value="OUTFLOW">Beklenen çıkış</option></select><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Tutar" className="rounded-lg border p-3"/><Button onClick={() => void add()} disabled={!title || !amount}><Plus />Ekle</Button></div></div>
    {forecast?.points.map((point) => <div key={point.at} className="rounded-xl border bg-card p-4 text-sm"><div className="flex justify-between"><strong>{new Date(point.at).toLocaleDateString("tr-TR")}</strong><strong>{formatMoney(point.closingBalance)}</strong></div>{point.sourceItems.map((item) => <p key={item.id} className="mt-2 text-muted-foreground">{item.direction === "INFLOW" ? "+" : "-"} {item.title} · {formatMoney(item.amount)}</p>)}</div>)}
  </section>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><strong>{value}</strong></div>; }

function Budgets({ book, budgets, onDone }: { book: FinanceBook; budgets: Budget[]; onDone: () => void }) {
  const [name, setName] = useState(""); const [amount, setAmount] = useState(""); const [performance, setPerformance] = useState<Awaited<ReturnType<typeof cashflowPlanningApplication.queries.budgetPerformance>>>();
  const create = async () => { try { const now = dateMs(dateValue()); const budget = await cashflowPlanningApplication.commands.createBudget({ financeBookId: book.id, name, periodType: "MONTHLY", startDate: now, endDate: now + 30 * 86_400_000, currency: book.baseCurrency }); await cashflowPlanningApplication.commands.setBudgetAllocation({ budgetId: budget.id, financeBookId: book.id, amount: parseMoneyInput(amount, book.baseCurrency) }); setName(""); setAmount(""); onDone(); setPerformance(await cashflowPlanningApplication.queries.budgetPerformance(budget.id)); } catch (error) { toast.error(error instanceof Error ? error.message : "Bütçe oluşturulamadı"); } };
  const view = async (id: string) => setPerformance(await cashflowPlanningApplication.queries.budgetPerformance(id));
  return <section className="space-y-4"><div className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Aylık bütçe</h2><div className="mt-3 grid gap-2 sm:grid-cols-3"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Örn. Ağustos" className="rounded-lg border p-3"/><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Toplam tahsis" className="rounded-lg border p-3"/><Button onClick={() => void create()} disabled={!name || !amount}><Plus />Oluştur</Button></div></div>{budgets.map((budget) => <button key={budget.id} onClick={() => void view(budget.id)} className="block w-full rounded-xl border bg-card p-4 text-left"><strong>{budget.name}</strong><p className="text-sm text-muted-foreground">{budget.periodType} · {budget.status}</p></button>)}{performance && <div className="rounded-xl border bg-card p-4"><h2 className="font-semibold">{performance.budget.name}</h2><p className="mt-2 text-sm">Planlanan {formatMoney(performance.totalBudgeted)} · Harcanan {formatMoney(performance.totalActual)}</p><p className="mt-1 text-sm text-muted-foreground">Kategorisiz harcama: {formatMoney(performance.uncategorized)}</p></div>}</section>;
}

function Goals({ book, goals, onDone }: { book: FinanceBook; goals: FinancialGoal[]; onDone: () => void }) {
  const [name, setName] = useState(""); const [amount, setAmount] = useState(""); const [details, setDetails] = useState<Awaited<ReturnType<typeof cashflowPlanningApplication.queries.goalProgress>>[]> ([]);
  const load = async () => setDetails(await Promise.all(goals.map((goal) => cashflowPlanningApplication.queries.goalProgress(goal.id))));
  useEffect(() => { void load(); }, [goals]);
  const create = async () => { try { await cashflowPlanningApplication.commands.createFinancialGoal({ financeBookId: book.id, name, type: "CUSTOM", targetAmount: parseMoneyInput(amount, book.baseCurrency), currentAmountMode: "MANUAL", manualCurrentAmount: parseMoneyInput("0", book.baseCurrency) }); setName(""); setAmount(""); onDone(); } catch (error) { toast.error(error instanceof Error ? error.message : "Hedef oluşturulamadı"); } };
  return <section className="space-y-4"><div className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Finansal hedef</h2><div className="mt-3 grid gap-2 sm:grid-cols-3"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Örn. Acil durum fonu" className="rounded-lg border p-3"/><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Hedef tutar" className="rounded-lg border p-3"/><Button onClick={() => void create()} disabled={!name || !amount}><Plus />Oluştur</Button></div></div>{details.map(({ goal, current, remaining, percentage, requiredMonthlySaving }) => <div key={goal.id} className="rounded-xl border bg-card p-4"><div className="flex justify-between"><strong>{goal.name}</strong><span>{Math.min(100, percentage).toFixed(0)}%</span></div><p className="mt-2 text-sm">{formatMoney(current)} / {formatMoney(goal.targetAmount)}</p><p className="text-sm text-muted-foreground">Kalan: {formatMoney(remaining)}{requiredMonthlySaving ? ` · Aylık gerekli: ${formatMoney(requiredMonthlySaving)}` : ""}</p></div>)}</section>;
}
