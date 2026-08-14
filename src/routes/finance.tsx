import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, Landmark, Plus, ReceiptText, Send, WalletCards } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { financeApplication } from "@/application/finance/finance-application";
import { financeTriggerApplication, type FinanceAlertView } from "@/application/finance/triggers";
import { formatMoney, parseMoneyInput } from "@/application/finance/money-input";
import type { CurrencyCode, FinanceBook, FinancialAccount } from "@/domain/finance";
import { toast } from "sonner";

export const Route = createFileRoute("/finance")({
  head: () => ({ meta: [{ title: "Finans — MintMap" }] }),
  component: FinancePage,
});
type Tab = "OVERVIEW" | "ACCOUNTS" | "LEDGER" | "OBLIGATIONS" | "STATEMENTS";
const dateValue = () => new Date().toISOString().slice(0, 10);
const dateMs = (value: string) => new Date(`${value}T12:00:00`).getTime();

function FinancePage() {
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
    ] = await Promise.all([
      financeApplication.queries.accounts(active),
      financeApplication.queries.overview(active),
      financeApplication.queries.transactions(active),
      financeApplication.queries.obligations(active),
      financeApplication.queries.statements(active),
      financeTriggerApplication.evaluate(active),
    ]);
    setAccounts(nextAccounts);
    setOverview(nextOverview);
    setTransactions(nextTransactions);
    setObligations(nextObligations);
    setStatements(nextStatements);
    setAlerts(triggerResult.alerts);
  };
  useEffect(() => {
    void refresh();
  }, []);
  const activeBook = books.find((book) => book.id === bookId);
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
          {(["OVERVIEW", "ACCOUNTS", "LEDGER", "OBLIGATIONS", "STATEMENTS"] as Tab[]).map(
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
      </main>
      <BottomNav />
    </div>
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
      if (!accounts[0]) throw new Error("Ödeme için önce bir varlık hesabı oluşturmalısın.");
      const payment = await financeApplication.commands.schedulePayment({
        obligationId: id,
        amount: obligation.amountDue,
        fromAccountId: accounts[0].id,
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
