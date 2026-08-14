import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "../..");
const port = Number(process.env.MINTMAP_E2E_PORT ?? 5185);
const url = `http://127.0.0.1:${port}`;
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(chrome)) throw new Error(`Chrome bulunamadı: ${chrome}`);
const server = spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore", windowsHide: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready() { for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${url}/finance`)).ok) return; } catch {} await wait(500); } throw new Error("Güncel Vite sunucusu açılamadı."); }
let browser;
try {
  await ready();
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("mintmap:unlocked", "1"));
  const page = await context.newPage();
  const errors = [], remote = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith(url)) remote.push(request.url()); });
  const expect = (value, message) => { if (!value) throw new Error(message); };
  const now = Date.parse("2026-08-14T12:00:00Z");
  await page.goto(`${url}/finance`);
  await page.waitForTimeout(800);
  await page.evaluate(async (now) => {
    const stores = ["meta", "execution_extensions", "finance_books", "finance_institutions", "finance_accounts", "finance_categories", "finance_payees", "finance_transactions", "finance_transfers", "finance_obligations", "finance_payments", "finance_statements", "finance_schedules", "migration_journal", "persistence_operations", "notification_intents", "notification_history", "notification_schedule", "focus_sessions", "routine_sessions", "rollover_decisions", "capture_items", "capture_proposals", "capture_document_refs", "capture_document_content", "finance_capture_proposals", "finance_import_batches", "finance_import_rows", "reconciliation_sessions", "expected_cashflow_items", "budgets", "budget_allocations", "financial_goals"];
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("mintmap-canonical", 8); request.onupgradeneeded = () => stores.forEach((store) => { if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: "id" }); }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const put = (store, entityType, payload) => new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put({ id: payload.id, entityType, schemaVersion: 1, revision: 1, createdAt: now, updatedAt: now, payload }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    const book = { id: "phase15-browser-book", name: "Phase15 Browser Test", type: "PERSONAL", baseCurrency: "TRY", createdAt: now, updatedAt: now, metadata: {} };
    const business = { id: "phase15-browser-business", name: "Phase15 Business", type: "BUSINESS", baseCurrency: "TRY", createdAt: now, updatedAt: now, metadata: {} };
    const a = (id, name, type, role, currency) => ({ id, financeBookId: book.id, name, type, role, currency, createdAt: now, updatedAt: now, metadata: {} });
    const bankA = a("phase15-bank-a", "Banka A", "BANK", "ASSET", "TRY"), bankB = a("phase15-bank-b", "Banka B", "BANK", "ASSET", "TRY"), card = a("phase15-card", "Kart", "CREDIT_CARD", "LIABILITY", "TRY"), loan = a("phase15-loan", "Kredi", "LOAN", "LIABILITY", "TRY"), usd = a("phase15-usd", "USD Banka", "BANK", "ASSET", "USD");
    const tx = (id, accountId, amount, intent, extra = {}) => ({ id, financeBookId: book.id, accountId, date: now, createdAt: now, updatedAt: now, amount: { minorUnits: amount, currency: "TRY" }, status: "CLEARED", sourceType: "MANUAL", metadata: { intent }, ...extra });
    const obligation = { id: "phase15-obligation", financeBookId: book.id, type: "UTILITY", title: "Elektrik", dueDate: now + 3 * 86400000, amountDue: { minorUnits: 8000000, currency: "TRY" }, status: "PAYMENT_DUE", createdAt: now, updatedAt: now, metadata: {} };
    const payment = { id: "phase15-scheduled", financeBookId: book.id, obligationId: obligation.id, fromAccountId: bankA.id, amount: { minorUnits: 3000000, currency: "TRY" }, status: "SCHEDULED", scheduledFor: now + 2 * 86400000, createdAt: now, updatedAt: now, metadata: {} };
    const income = { id: "phase15-income", financeBookId: book.id, title: "Maaş", direction: "INFLOW", amount: { minorUnits: 4000000, currency: "TRY" }, expectedAt: now + 5 * 86400000, confidence: "EXPECTED", status: "ACTIVE", createdAt: now, updatedAt: now, metadata: { dateOnly: true } };
    const outflow = { id: "phase15-outflow", financeBookId: book.id, title: "Planlı gider", direction: "OUTFLOW", amount: { minorUnits: 7000000, currency: "TRY" }, expectedAt: now + 8 * 86400000, confidence: "EXPECTED", status: "ACTIVE", createdAt: now, updatedAt: now, metadata: { dateOnly: true } };
    const budget = { id: "phase15-budget", financeBookId: book.id, name: "Ağustos", periodType: "MONTHLY", startDate: now - 86400000, endDate: now + 30 * 86400000, currency: "TRY", status: "ACTIVE", warningThresholds: [80, 100], createdAt: now, updatedAt: now, metadata: {} };
    const allocation = { id: "phase15-allocation", budgetId: budget.id, financeBookId: book.id, amount: { minorUnits: 2000000, currency: "TRY" }, createdAt: now, updatedAt: now, metadata: {} };
    const goal = { id: "phase15-goal", financeBookId: book.id, name: "Arsa", type: "LAND", targetAmount: { minorUnits: 100000000, currency: "TRY" }, currency: "TRY", currentAmountMode: "MANUAL", manualCurrentAmount: { minorUnits: 25000000, currency: "TRY" }, status: "ACTIVE", createdAt: now, updatedAt: now, metadata: {} };
    const records = [["finance_books", "FinanceBook", book], ["finance_books", "FinanceBook", business], ...[bankA, bankB, card, loan, usd].map((x) => ["finance_accounts", "FinancialAccount", x]), ...[tx("phase15-opening", bankA.id, 10000000, "INCOME"), tx("phase15-grocery", bankA.id, -1500000, "EXPENSE"), tx("phase15-card-purchase", card.id, -500000, "EXPENSE"), tx("phase15-transfer-out", bankA.id, -4000000, "TRANSFER", { transferId: "phase15-transfer" }), tx("phase15-transfer-in", bankB.id, 4000000, "TRANSFER", { transferId: "phase15-transfer" }), { ...tx("phase15-usd-opening", usd.id, 10000, "INCOME"), amount: { minorUnits: 10000, currency: "USD" } }].map((x) => ["finance_transactions", "FinancialTransaction", x]), ["finance_obligations", "FinancialObligation", obligation], ["finance_payments", "FinancialPayment", payment], ["expected_cashflow_items", "ExpectedCashflowItem", income], ["expected_cashflow_items", "ExpectedCashflowItem", outflow], ["budgets", "Budget", budget], ["budget_allocations", "BudgetAllocation", allocation], ["financial_goals", "FinancialGoal", goal]];
    for (const [store, type, record] of records) await put(store, type, record);
    db.close();
  }, now);
  await page.reload();
  await page.getByRole("heading", { name: "Finans", exact: true }).waitFor();
  expect(await page.getByRole("button", { name: "Nakit akışı" }).count() && await page.getByRole("button", { name: "Bütçeler" }).count() && await page.getByRole("button", { name: "Hedefler" }).count(), "Current bundle Phase 15 sekmelerini içermiyor.");
  await page.locator("select").first().selectOption("phase15-browser-book");
  await page.getByRole("button", { name: "Nakit akışı" }).click(); await page.getByRole("heading", { name: "Nakit akışı" }).waitFor();
  expect(await page.getByText("Maaş").count() && await page.getByText("Planlı gider").count(), "Forecast kaynakları görünmüyor.");
  for (const days of [7, 14, 30, 90]) { await page.locator("select").nth(1).selectOption(String(days)); await wait(100); }
  await page.getByRole("button", { name: "Bütçeler" }).click(); await page.getByText("Ağustos").click(); await page.getByText("Planlanan").waitFor(); expect(await page.getByText("Kategorisiz harcama:").count(), "Kategorisiz harcama görünmüyor.");
  await page.getByRole("button", { name: "Hedefler" }).click(); await page.getByText("Arsa").waitFor(); expect(await page.getByText("25%").count(), "Hedef ilerlemesi görünmüyor.");
  await page.reload(); await page.getByRole("heading", { name: "Finans", exact: true }).waitFor();
  expect(errors.length === 0, `Konsol hataları: ${errors.join(" | ")}`); expect(remote.length === 0, `Beklenmeyen ağ isteği: ${remote.join(" | ")}`);
  console.log(`Finance planning browser validation passed at ${url}`);
  await context.close();
} finally { await browser?.close(); server.kill(); }
