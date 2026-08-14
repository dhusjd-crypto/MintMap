import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "../..");
const port = Number(process.env.MINTMAP_E2E_PORT ?? 5185);
const url = `http://127.0.0.1:${port}`;
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(chrome)) throw new Error(`Chrome bulunamadı: ${chrome}`);
const vite = resolve(root, "node_modules/vite/bin/vite.js");
const server = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore", windowsHide: true });
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
  const now = Date.now();

  await page.goto(`${url}/finance`);
  await page.waitForTimeout(800);
  await page.evaluate(async (now) => {
    const stores = ["meta", "execution_extensions", "finance_books", "finance_institutions", "finance_accounts", "finance_categories", "finance_payees", "finance_transactions", "finance_transfers", "finance_obligations", "finance_payments", "finance_statements", "finance_schedules", "migration_journal", "persistence_operations", "notification_intents", "notification_history", "notification_schedule", "focus_sessions", "routine_sessions", "rollover_decisions", "capture_items", "capture_proposals", "capture_document_refs", "capture_document_content", "finance_capture_proposals", "finance_import_batches", "finance_import_rows", "reconciliation_sessions", "expected_cashflow_items", "budgets", "budget_allocations", "financial_goals"];
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("mintmap-canonical", 8); request.onupgradeneeded = () => stores.forEach((store) => { if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: "id" }); }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const put = (store, entityType, payload) => new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put({ id: payload.id, entityType, schemaVersion: 1, revision: 1, createdAt: now, updatedAt: now, payload }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    const bookA = { id: "phase15-browser-book-a", name: "phase15-browser-book-a", type: "PERSONAL", baseCurrency: "TRY", createdAt: now, updatedAt: now, metadata: {} };
    const bookB = { id: "phase15-browser-book-b", name: "phase15-browser-book-b", type: "BUSINESS", baseCurrency: "TRY", createdAt: now, updatedAt: now, metadata: {} };
    const account = (id, financeBookId, name, type, role, currency) => ({ id, financeBookId, name, type, role, currency, createdAt: now, updatedAt: now, metadata: {} });
    const bankA = account("phase15-browser-bank-a", bookA.id, "phase15-browser-bank-a", "BANK", "ASSET", "TRY");
    const bankB = account("phase15-browser-bank-b", bookA.id, "phase15-browser-bank-b", "BANK", "ASSET", "TRY");
    const card = account("phase15-browser-card", bookA.id, "phase15-browser-card", "CREDIT_CARD", "LIABILITY", "TRY");
    const usd = account("phase15-browser-usd", bookA.id, "phase15-browser-usd", "BANK", "ASSET", "USD");
    const businessBank = account("phase15-browser-business-bank", bookB.id, "phase15-browser-business-bank", "BANK", "ASSET", "TRY");
    const transaction = (id, financeBookId, accountId, amount, currency, intent) => ({ id, financeBookId, accountId, date: now, createdAt: now, updatedAt: now, amount: { minorUnits: amount, currency }, status: "CLEARED", sourceType: "MANUAL", metadata: { intent } });
    const obligation = { id: "phase15-browser-obligation", financeBookId: bookA.id, type: "UTILITY", title: "phase15-browser-shortfall", dueDate: now + 3 * 86400000, amountDue: { minorUnits: 15000000, currency: "TRY" }, status: "PAYMENT_DUE", createdAt: now, updatedAt: now, metadata: {} };
    const payment = { id: "phase15-browser-scheduled", financeBookId: bookA.id, obligationId: obligation.id, fromAccountId: bankA.id, amount: { minorUnits: 3000000, currency: "TRY" }, status: "SCHEDULED", scheduledFor: now + 2 * 86400000, createdAt: now, updatedAt: now, metadata: {} };
    const item = (id, financeBookId, title, direction, amount, currency, expectedAt) => ({ id, financeBookId, title, direction, amount: { minorUnits: amount, currency }, expectedAt, confidence: "EXPECTED", status: "ACTIVE", createdAt: now, updatedAt: now, metadata: { dateOnly: true } });
    const budgetA = { id: "phase15-browser-budget-a", financeBookId: bookA.id, name: "phase15-browser-budget-a", periodType: "MONTHLY", startDate: now - 86400000, endDate: now + 30 * 86400000, currency: "TRY", status: "ACTIVE", warningThresholds: [80, 100], createdAt: now, updatedAt: now, metadata: {} };
    const allocationA = { id: "phase15-browser-allocation-a", budgetId: budgetA.id, financeBookId: bookA.id, amount: { minorUnits: 2000000, currency: "TRY" }, createdAt: now, updatedAt: now, metadata: {} };
    const goalA = { id: "phase15-browser-goal-a", financeBookId: bookA.id, name: "phase15-browser-goal-a", type: "LAND", targetAmount: { minorUnits: 100000000, currency: "TRY" }, currency: "TRY", currentAmountMode: "MANUAL", manualCurrentAmount: { minorUnits: 25000000, currency: "TRY" }, status: "ACTIVE", createdAt: now, updatedAt: now, metadata: {} };
    const budgetB = { ...budgetA, id: "phase15-browser-budget-b", financeBookId: bookB.id, name: "phase15-browser-budget-b" };
    const allocationB = { ...allocationA, id: "phase15-browser-allocation-b", budgetId: budgetB.id, financeBookId: bookB.id };
    const goalB = { ...goalA, id: "phase15-browser-goal-b", financeBookId: bookB.id, name: "phase15-browser-goal-b" };
    const records = [["finance_books", "FinanceBook", bookA], ["finance_books", "FinanceBook", bookB], ...[bankA, bankB, card, usd, businessBank].map((value) => ["finance_accounts", "FinancialAccount", value]), ...[transaction("phase15-browser-opening", bookA.id, bankA.id, 10000000, "TRY", "INCOME"), transaction("phase15-browser-card-purchase", bookA.id, card.id, -500000, "TRY", "EXPENSE"), transaction("phase15-browser-usd-opening", bookA.id, usd.id, 200000, "USD", "INCOME"), transaction("phase15-browser-business-opening", bookB.id, businessBank.id, 2500000, "TRY", "INCOME")].map((value) => ["finance_transactions", "FinancialTransaction", value]), ["finance_obligations", "FinancialObligation", obligation], ["finance_payments", "FinancialPayment", payment], ["expected_cashflow_items", "ExpectedCashflowItem", item("phase15-browser-backup-inflow", bookA.id, "phase15-browser-backup-inflow", "INFLOW", 4000000, "TRY", now + 60 * 86400000)], ["expected_cashflow_items", "ExpectedCashflowItem", item("phase15-browser-business-outflow", bookB.id, "phase15-browser-business-outflow", "OUTFLOW", 1000000, "TRY", now + 2 * 86400000)], ["expected_cashflow_items", "ExpectedCashflowItem", item("phase15-browser-usd-inflow", bookA.id, "phase15-browser-usd-inflow", "INFLOW", 50000, "USD", now + 2 * 86400000)], ["budgets", "Budget", budgetA], ["budget_allocations", "BudgetAllocation", allocationA], ["financial_goals", "FinancialGoal", goalA], ["budgets", "Budget", budgetB], ["budget_allocations", "BudgetAllocation", allocationB], ["financial_goals", "FinancialGoal", goalB]];
    for (const [store, type, record] of records) await put(store, type, record);
    db.close();
  }, now);

  await page.reload(); await page.getByRole("heading", { name: "Finans", exact: true }).waitFor(); await page.waitForTimeout(1000);
  expect(await page.getByRole("button", { name: "Nakit akışı" }).count() && await page.getByRole("button", { name: "Bütçeler" }).count() && await page.getByRole("button", { name: "Hedefler" }).count(), "Current bundle Phase 15 sekmelerini içermiyor.");
  const bookSelect = page.locator("select").first();
  await bookSelect.selectOption("phase15-browser-book-a");
  await page.getByRole("button", { name: "Nakit akışı" }).click(); await page.getByRole("heading", { name: "Nakit akışı" }).waitFor();
  expect(await page.getByText("phase15-browser-shortfall").count() === 1, "Yükümlülük ve zamanlanmış ödeme iki kez tahmin edildi.");
  expect(await page.getByText("₺50.000,00").count() > 0, "Gerçek nakit açığı görünmüyor.");
  await page.getByRole("button", { name: "Özet" }).click(); expect(await page.getByText("Beklenen nakit açığı").count() > 0, "FIN-T15 gerçek forecast üzerinden tetiklenmedi.");
  await page.getByRole("button", { name: "Nakit akışı" }).click();
  for (const days of [7, 14, 30, 90]) await page.getByLabel("Nakit akışı vadesi").selectOption(String(days));
  await page.getByPlaceholder("Örn. Maaş").fill("phase15-browser-resolve-shortfall");
  await page.getByLabel("Beklenen hareket tarihi").fill(new Date(now + 86400000).toISOString().slice(0, 10));
  await page.getByPlaceholder("Tutar").fill("60.000"); await page.getByRole("button", { name: "Ekle" }).click();
  await page.getByText("phase15-browser-resolve-shortfall").waitFor(); expect(await page.getByText("₺0,00").count() > 0, "Nakit açığı uygulama komutuyla çözülmedi.");
  await page.getByRole("button", { name: "Özet" }).click(); expect(await page.getByText("Beklenen nakit açığı").count() === 0, "FIN-T15 çözümden sonra temizlenmedi.");
  await page.reload(); await page.getByRole("heading", { name: "Finans", exact: true }).waitFor(); expect(await page.getByText("Beklenen nakit açığı").count() === 0, "FIN-T15 yenilemeden sonra eski kaldı.");

  await bookSelect.selectOption("phase15-browser-book-a"); await page.getByRole("button", { name: "Bütçeler" }).click(); await page.getByText("phase15-browser-budget-a").waitFor(); await page.getByText("phase15-browser-budget-a").click(); await page.getByText("Planlanan").waitFor(); expect(await page.getByText(/Harcanan.*5\.000,00/).count() > 0, "Kart alışverişi bütçede görünmüyor.");
  await page.getByRole("button", { name: "İşlemler" }).click(); const ledgerSelects = page.locator("select"); await ledgerSelects.nth(3).selectOption("phase15-browser-bank-a"); await ledgerSelects.nth(4).selectOption("phase15-browser-card"); await page.getByPlaceholder("Tutar").last().fill("5.000"); await page.getByRole("button", { name: "Transfer" }).click();
  await page.getByRole("button", { name: "Bütçeler" }).click(); await page.getByText("phase15-browser-budget-a").click(); await page.getByText("Planlanan").waitFor(); expect(await page.getByText(/Harcanan.*5\.000,00/).count() > 0, "Banka → kart ödemesi bütçeyi ikinci kez harcama saydı.");

  await page.getByRole("button", { name: "Nakit akışı" }).click(); await page.getByLabel("Nakit akışı para birimi").selectOption("USD"); await page.getByText("phase15-browser-usd-inflow").waitFor(); expect(await page.getByText("phase15-browser-resolve-shortfall").count() === 0, "TRY nakit akışı USD görünümüne sızdı.");
  await bookSelect.selectOption("phase15-browser-book-b"); await page.getByRole("button", { name: "Nakit akışı" }).click(); expect(await page.getByText("phase15-browser-business-outflow").count() === 1, "Business nakit akışı görünmüyor."); expect(await page.getByText("phase15-browser-shortfall").count() === 0, "Personal nakit akışı Business kitaba sızdı.");
  await page.getByRole("button", { name: "Bütçeler" }).click(); expect(await page.getByText("phase15-browser-budget-b").count() === 1 && await page.getByText("phase15-browser-budget-a").count() === 0, "Bütçe kitap izolasyonu bozuk.");
  await page.getByRole("button", { name: "Hedefler" }).click(); await page.getByText("phase15-browser-goal-b").waitFor(); expect(await page.getByText("phase15-browser-goal-a").count() === 0, "Hedef kitap izolasyonu bozuk.");

  await bookSelect.selectOption("phase15-browser-book-a"); await page.getByText("phase15-browser-goal-a").waitFor(); await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const validation = window.__mintmapFinancePlanningValidation;
    if (!validation) throw new Error("Backup doğrulama köprüsü hazır değil.");
    void validation.createBackup().then(
      (bundle) => sessionStorage.setItem("phase15-browser-backup", JSON.stringify(bundle)),
      (error) => sessionStorage.setItem("phase15-browser-backup-error", String(error)),
    );
  });
  try {
    await page.waitForFunction(
      () => Boolean(sessionStorage.getItem("phase15-browser-backup") || sessionStorage.getItem("phase15-browser-backup-error")),
      { timeout: 10_000 },
    );
  } catch {
    const stage = await page.evaluate(() => sessionStorage.getItem("mintmap:finance-planning-backup-stage"));
    throw new Error(`Canonical backup zaman aşımı: ${stage ?? "aşama bilinmiyor"}`);
  }
  const backup = await page.evaluate(() => {
    const failure = sessionStorage.getItem("phase15-browser-backup-error");
    if (failure) throw new Error(failure);
    return JSON.parse(sessionStorage.getItem("phase15-browser-backup") ?? "{}");
  });
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("mintmap-canonical", 8); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const mutate = (store, id, patch) => new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); const source = tx.objectStore(store); const get = source.get(id); get.onsuccess = () => { const value = get.result; if (!value) { reject(new Error(`${store}:${id} bulunamadı.`)); return; } value.payload = { ...value.payload, ...patch, updatedAt: Date.now() }; value.updatedAt = Date.now(); value.revision += 1; source.put(value); }; tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted")); });
    await mutate("expected_cashflow_items", "phase15-browser-backup-inflow", { amount: { minorUnits: 500000, currency: "TRY" } }); await mutate("budget_allocations", "phase15-browser-allocation-a", { amount: { minorUnits: 200000, currency: "TRY" } }); await mutate("financial_goals", "phase15-browser-goal-a", { targetAmount: { minorUnits: 10000000, currency: "TRY" } }); db.close();
  });
  await page.reload(); await page.getByRole("heading", { name: "Finans", exact: true }).waitFor(); await page.waitForTimeout(1000);
  expect(Boolean(backup.id && backup.checksum), "Gerçek canonical backup oluşturulamadı.");
  await page.reload(); await page.getByRole("heading", { name: "Finans", exact: true }).waitFor(); await bookSelect.selectOption("phase15-browser-book-a"); await page.getByRole("button", { name: "Bütçeler" }).click(); await page.getByText("phase15-browser-budget-a").click(); await page.getByText("Planlanan").waitFor(); expect(await page.getByText(/Planlanan.*2\.000,00/).count() > 0, "Backup öncesi mutasyon tarayıcıda görünmedi.");
  await page.evaluate(async (backupId) => { const validation = window.__mintmapFinancePlanningValidation; if (!validation) throw new Error("Backup doğrulama köprüsü hazır değil."); await validation.restoreBackup(backupId); }, backup.id);
  const restored = await page.evaluate(async () => { const db = await new Promise((resolve, reject) => { const request = indexedDB.open("mintmap-canonical", 8); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); const read = (store, id) => new Promise((resolve, reject) => { const request = db.transaction(store, "readonly").objectStore(store).get(id); request.onsuccess = () => resolve(request.result?.payload); request.onerror = () => reject(request.error); }); const result = await Promise.all([read("expected_cashflow_items", "phase15-browser-backup-inflow"), read("budget_allocations", "phase15-browser-allocation-a"), read("financial_goals", "phase15-browser-goal-a")]); db.close(); return result; });
  expect(restored[0]?.amount?.minorUnits === 4000000 && restored[1]?.amount?.minorUnits === 2000000 && restored[2]?.targetAmount?.minorUnits === 100000000, "Backup/restore tam canonical değerleri geri getirmedi.");
  await page.reload(); await page.getByRole("heading", { name: "Finans", exact: true }).waitFor(); await bookSelect.selectOption("phase15-browser-book-a"); await page.getByRole("button", { name: "Nakit akışı" }).click(); expect(await page.getByText("phase15-browser-resolve-shortfall").count() === 1 && await page.getByText("₺0,00").count() > 0, "Restore sonrası Cashflow operasyonel değil.");
  await page.getByRole("button", { name: "Bütçeler" }).click(); await page.getByText("phase15-browser-budget-a").click(); await page.getByText("Planlanan").waitFor(); expect(await page.getByText(/Planlanan.*20\.000,00/).count() > 0, "Restore sonrası bütçe ilişkisi korunmadı.");
  await page.getByRole("button", { name: "Hedefler" }).click(); expect(await page.getByText("phase15-browser-goal-a").count() === 1 && await page.getByText("25%").count() > 0, "Restore sonrası hedef yapılandırması korunmadı.");
  expect(errors.length === 0, `Konsol hataları: ${errors.join(" | ")}`); expect(remote.length === 0, `Beklenmeyen ağ isteği: ${remote.join(" | ")}`);
  console.log(`Finance planning strict browser validation passed at ${url}`);
  await context.close();
} finally { await browser?.close(); server.kill(); }
