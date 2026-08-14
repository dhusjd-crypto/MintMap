import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "../..");
const appUrl = process.env.MINTMAP_E2E_URL ?? "http://127.0.0.1:5173";
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const fixtureDirectory = resolve(root, "tests/e2e/fixtures/generated");

if (!existsSync(chrome)) throw new Error(`Chrome bulunamadı: ${chrome}`);
execFileSync(process.execPath, ["tests/e2e/fixtures/generate_finance_ocr_fixtures.mjs"], {
  cwd: root,
  stdio: "inherit",
});

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => localStorage.setItem("mintmap:unlocked", "1"));
await context.addInitScript(() => {
  window.addEventListener("unhandledrejection", (event) => {
    console.error(`Unhandled validation rejection: ${String(event.reason)}`);
  });
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const remoteRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("request", (request) => {
  const url = request.url();
  if (/^https?:\/\//.test(url) && !url.startsWith(appUrl)) remoteRequests.push(url);
});

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const waitForIdle = () => page.waitForTimeout(700);
const file = (name) => resolve(fixtureDirectory, name);

async function createFinanceFixture() {
  await page.goto(`${appUrl}/finance`);
  await page.waitForTimeout(1500);
  await page.locator("input").first().fill("Browser doğrulama kitabı");
  await page.getByRole("button", { name: "Finans kitabını oluştur" }).click();
  await page.getByRole("heading", { name: "Finans", exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Hesaplar" }).click();
  const accountName = page.getByPlaceholder("Örn. Yapı Kredi");
  await accountName.fill("Browser doğrulama banka");
  await page.locator("select").last().selectOption("BANK");
  await page.getByRole("button", { name: "Ekle" }).click();
  await waitForIdle();
  await accountName.fill("Browser doğrulama kartı");
  await page.locator("select").last().selectOption("CREDIT_CARD");
  await page.getByRole("button", { name: "Ekle" }).click();
  await waitForIdle();
}

async function captureAndOpenReview(filename, accountLabel = "Browser doğrulama kartı") {
  await page.goto(`${appUrl}/capture`);
  await page.getByRole("heading", { name: "Hızlı yakala" }).waitFor();
  await page.waitForTimeout(500);
  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles(file(filename));
  expect(
    (await upload.evaluate((input) => input.files?.length ?? 0)) === 1,
    `Tarayıcı dosyayı input alanına yerleştiremedi: ${filename}`,
  );
  // Chrome's direct file setter does not emit React's synthetic change event in
  // this isolated profile; dispatch the same DOM change produced by the picker.
  await upload.dispatchEvent("change");
  await page.waitForTimeout(1000);
  const captures = await readStore("capture_items");
  const newestCapture = [...captures].sort(
    (left, right) => Number(right.payload?.createdAt ?? 0) - Number(left.payload?.createdAt ?? 0),
  )[0];
  const books = await readStore("finance_books");
  expect(
    captures.length > 0,
    `Dosya yakalaması yazılamadı: ${filename}; kitaplar: ${books.length}; sayfa hataları: ${pageErrors.join(" | ")}`,
  );
  await page.getByText("Finansta incele", { exact: true }).first().click();
  await page.waitForURL(/\/finance\/review\//);
  await page.locator("select").nth(1).selectOption({ label: "Browser doğrulama kitabı" });
  await page.locator("select").nth(2).selectOption({ label: accountLabel });
  const refs = await readStore("capture_document_refs");
  const reference = refs.find(
    (value) => value.payload?.captureItemId === newestCapture?.payload?.id,
  );
  expect(
    reference?.payload?.name === filename,
    `Yanlış kaynak belge incelemeye açıldı: ${reference?.payload?.name}`,
  );
  return {
    reference: reference?.payload,
    bookId: await page.locator("select").nth(1).inputValue(),
  };
}

async function createPaymentEvidenceFixture() {
  await page.goto(`${appUrl}/finance`);
  await page.getByRole("heading", { name: "Finans", exact: true }).waitFor();
  await page.getByRole("button", { name: "Ekstreler" }).click();
  await page.getByRole("button", { name: "Borç oluştur" }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Ödemeler" }).click();
  await page.getByRole("button", { name: "Ödemeyi onayla" }).first().click();
  await page.waitForTimeout(700);
  const payments = await readStore("finance_payments");
  const payment = [...payments]
    .map((value) => value.payload)
    .find((value) => value?.status === "CONFIRMED" && value.transferId);
  expect(
    payment,
    `Kart ekstre ödemesi transferli biçimde oluşturulamadı: ${JSON.stringify(
      payments.map((value) => value.payload),
    )}`,
  );
  await page.evaluate(async (paymentId) => {
    const request = indexedDB.open("mintmap-canonical");
    const db = await new Promise((resolvePromise, reject) => {
      request.onsuccess = () => resolvePromise(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(["finance_payments", "finance_obligations"], "readwrite");
    const paymentStore = transaction.objectStore("finance_payments");
    const paymentEnvelope = await new Promise((resolvePromise, reject) => {
      const get = paymentStore.get(paymentId);
      get.onsuccess = () => resolvePromise(get.result);
      get.onerror = () => reject(get.error);
    });
    const payment = paymentEnvelope.payload;
    const scheduled = {
      ...payment,
      status: "SCHEDULED",
      paymentReference: "TEST-RECEIPT-001",
      confirmedAt: undefined,
      paidAt: undefined,
      updatedAt: Date.now(),
    };
    paymentStore.put({
      ...paymentEnvelope,
      revision: paymentEnvelope.revision + 1,
      payload: scheduled,
    });
    const obligationStore = transaction.objectStore("finance_obligations");
    const obligationEnvelope = await new Promise((resolvePromise, reject) => {
      const get = obligationStore.get(payment.obligationId);
      get.onsuccess = () => resolvePromise(get.result);
      get.onerror = () => reject(get.error);
    });
    obligationStore.put({
      ...obligationEnvelope,
      revision: obligationEnvelope.revision + 1,
      payload: {
        ...obligationEnvelope.payload,
        status: "PAYMENT_DUE",
        paidAt: undefined,
        updatedAt: Date.now(),
      },
    });
    await new Promise((resolvePromise, reject) => {
      transaction.oncomplete = () => resolvePromise(undefined);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }, payment.id);
  return payment;
}

async function extractAndFillPayment(amount) {
  const proposalCount = (await readStore("finance_capture_proposals")).length;
  await page.getByRole("button", { name: "Yerel metni çıkar" }).click();
  const deadline = Date.now() + 90000;
  while ((await readStore("finance_capture_proposals")).length <= proposalCount) {
    if (Date.now() > deadline) throw new Error("Ödeme dekontu çıkarma zaman aşımına uğradı.");
    const extractionError = await page
      .locator('[data-sonner-toast][data-type="error"]')
      .allTextContents();
    if (extractionError.length > 0)
      throw new Error(`Ödeme dekontu çıkarma hatası: ${extractionError.join(" | ")}`);
    await page.waitForTimeout(500);
  }
  await page.locator('input[type="date"]').fill("2026-08-14");
  await page.locator('input[type="text"]').nth(0).fill(amount);
  await page.locator('input[type="text"]').nth(1).fill("TEST-RECEIPT-001");
}

async function extractAndFillStatement({ statementDate, dueDate, balance, minimum }) {
  const proposalCount = (await readStore("finance_capture_proposals")).length;
  const extractButton = page.getByRole("button", { name: "Yerel metni çıkar" });
  await extractButton.click();
  const deadline = Date.now() + 90000;
  while ((await readStore("finance_capture_proposals")).length <= proposalCount) {
    if (Date.now() > deadline) throw new Error("Yerel metin çıkarma zaman aşımına uğradı.");
    const extractionError = await page
      .locator('[data-sonner-toast][data-type="error"]')
      .allTextContents();
    if (extractionError.length > 0)
      throw new Error(`Yerel metin çıkarma hatası: ${extractionError.join(" | ")}`);
    await page.waitForTimeout(500);
  }
  await page.locator('input[type="date"]').nth(0).fill(statementDate);
  await page.locator('input[type="date"]').nth(1).fill(dueDate);
  await page.locator('input[type="text"]').nth(0).fill(balance);
  await page.locator('input[type="text"]').nth(1).fill(minimum);
  expect(
    (await page.locator('input[type="text"]').nth(0).inputValue()) === balance,
    "Dönem borcu düzenleme alanına yazılamadı.",
  );
}

async function readStore(name) {
  return page.evaluate(async (storeName) => {
    const request = indexedDB.open("mintmap-canonical");
    const db = await new Promise((resolvePromise, reject) => {
      request.onsuccess = () => resolvePromise(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(storeName, "readonly");
    const getAll = transaction.objectStore(storeName).getAll();
    return await new Promise((resolvePromise, reject) => {
      getAll.onsuccess = () => resolvePromise(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    });
  }, name);
}

async function readDocumentContentInfo() {
  return page.evaluate(async () => {
    const request = indexedDB.open("mintmap-canonical");
    const db = await new Promise((resolvePromise, reject) => {
      request.onsuccess = () => resolvePromise(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction("capture_document_content", "readonly");
    const getAll = transaction.objectStore("capture_document_content").getAll();
    const records = await new Promise((resolvePromise, reject) => {
      getAll.onsuccess = () => resolvePromise(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    });
    return records.map((record) => ({
      id: record.id,
      documentRefId: record.payload?.documentRefId,
      size: record.payload?.blob?.size ?? 0,
      type: record.payload?.blob?.type ?? "",
    }));
  });
}

async function confirmStatementAndPersist() {
  await page.getByRole("button", { name: "Ekstreyi onayla" }).click();
  await waitForIdle();
  const statements = await readStore("finance_statements");
  expect(statements.length > 0, "Açık onay sonrasında ekstre oluşmadı.");
  await page.reload();
  await page.getByRole("heading", { name: "Finansta incele" }).waitFor();
  const blobs = await readDocumentContentInfo();
  expect(
    blobs.some((value) => value.size > 0),
    "Blob belge yenileme sonrası bulunamadı.",
  );
  const backup = await page.evaluate(async () => {
    const { canonicalStorage } = await import("/src/lib/canonical-persistence/storage.ts");
    const { InMemoryBackupStore, createBackup, validateBackup } =
      await import("/src/lib/canonical-persistence/backup.ts");
    const bundle = await createBackup(canonicalStorage, new InMemoryBackupStore());
    const validation = await validateBackup(bundle);
    return {
      valid: validation.valid,
      documentCount: bundle.manifest.recordCounts.capture_document_content,
    };
  });
  expect(
    backup.valid && backup.documentCount > 0,
    "Blob içeren yedek checksum doğrulamasından geçmedi.",
  );
}

try {
  await createFinanceFixture();

  await captureAndOpenReview("statement-screenshot.png");
  await extractAndFillStatement({
    statementDate: "2026-08-01",
    dueDate: "2026-08-25",
    balance: "87.450,37",
    minimum: "17.490,07",
  });
  await confirmStatementAndPersist();
  const imageProposals = await readStore("finance_capture_proposals");
  expect(
    imageProposals.some((value) => value.payload?.metadata?.method === "OCR_IMAGE"),
    "Görsel için OCR_IMAGE yöntemi kaydedilmedi.",
  );

  await captureAndOpenReview("statement-scanned.pdf");
  await extractAndFillStatement({
    statementDate: "2026-08-02",
    dueDate: "2026-08-26",
    balance: "10.000,00",
    minimum: "1.000,00",
  });
  await confirmStatementAndPersist();
  const scannedProposals = await readStore("finance_capture_proposals");
  expect(
    scannedProposals.some((value) => value.payload?.metadata?.method === "OCR_PDF"),
    `Taranmış PDF için OCR_PDF geri dönüşü gözlenmedi: ${scannedProposals
      .map((value) => String(value.payload?.metadata?.method ?? "<method yok>"))
      .join(", ")}`,
  );

  await captureAndOpenReview("statement-embedded-text.pdf");
  await extractAndFillStatement({
    statementDate: "2026-08-03",
    dueDate: "2026-08-27",
    balance: "87.450,37",
    minimum: "17.490,07",
  });
  await confirmStatementAndPersist();
  const embeddedProposals = await readStore("finance_capture_proposals");
  expect(
    embeddedProposals.some((value) => value.payload?.metadata?.method === "EMBEDDED_PDF_TEXT"),
    "Metinli PDF gereksiz OCR yerine EMBEDDED_PDF_TEXT kullanmadı.",
  );

  const paymentFixture = await createPaymentEvidenceFixture();
  expect(
    (await readStore("finance_payments")).some((value) => value.payload?.id === paymentFixture.id),
    "Ödeme dekontu fixture ödemesi IndexedDB'ye yazılamadı.",
  );
  const transactionCountBeforeReceipt = (await readStore("finance_transactions")).length;
  const transferCountBeforeReceipt = (await readStore("finance_transfers")).length;
  const receiptReview = await captureAndOpenReview(
    "payment-receipt.png",
    "Browser doğrulama banka",
  );
  expect(
    receiptReview.bookId === paymentFixture.financeBookId,
    `Dekont incelemesi yanlış finans kitabını seçti: ${receiptReview.bookId} != ${paymentFixture.financeBookId}`,
  );
  const paymentQueryResult = await page.evaluate(async (bookId) => {
    const module = await import("/src/application/finance/finance-application.ts");
    return module.financeApplication.queries.payments(bookId);
  }, receiptReview.bookId);
  expect(
    paymentQueryResult.some((payment) => payment.id === paymentFixture.id),
    `Ödeme sorgusu fixture kaydını döndürmedi: ${JSON.stringify(paymentQueryResult)}`,
  );
  await page.locator("select").first().selectOption("PAYMENT_CONFIRMATION");
  const receiptAmount = (paymentFixture.amount.minorUnits / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  await extractAndFillPayment(receiptAmount);
  const directPaymentMatchResult = await page.evaluate(
    async ({ bookId, paymentId, amount }) => {
      const finance = await import("/src/application/finance/finance-application.ts");
      const captureImport = await import("/src/application/finance/capture-import.ts");
      const payments = await finance.financeApplication.queries.payments(bookId);
      return {
        payments,
        matches: captureImport.matchPaymentEvidence(
          {
            amount,
            date: Date.parse("2026-08-14T12:00:00Z"),
            reference: "TEST-RECEIPT-001",
          },
          payments.filter((payment) => payment.id === paymentId),
        ),
      };
    },
    { bookId: receiptReview.bookId, paymentId: paymentFixture.id, amount: paymentFixture.amount },
  );
  expect(
    directPaymentMatchResult.matches.length === 1,
    `Ödeme eşleme motoru fixture'ı eşleştirmedi: ${JSON.stringify(directPaymentMatchResult)}`,
  );
  const paymentSelect = page.locator("select").nth(3);
  await page.waitForFunction(
    () => document.querySelectorAll("select")[3]?.querySelectorAll("option").length > 1,
    undefined,
    { timeout: 10000 },
  );
  const paymentOptions = await paymentSelect
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => ({ value: option.value, text: option.textContent ?? "" })),
    );
  const exactPaymentOption = paymentOptions.find((option) =>
    option.text.includes("EXACT_REFERENCE"),
  );
  expect(
    exactPaymentOption,
    `Ödeme dekontu için açıklanabilir kesin eşleşme görünmedi. Alanlar: ${JSON.stringify(
      await page.locator("input").evaluateAll((inputs) => inputs.map((input) => input.value)),
    )}; seçimler: ${JSON.stringify(
      await page.locator("select").evaluateAll((selects) => selects.map((select) => select.value)),
    )}; seçenekler: ${JSON.stringify(paymentOptions)}; öneriler: ${JSON.stringify(
      (await readStore("finance_capture_proposals")).map((value) => value.payload?.fields),
    )}`,
  );
  await paymentSelect.selectOption(exactPaymentOption.value);
  await page.getByRole("button", { name: "Bu dekontla ödemeyi onayla" }).click();
  await waitForIdle();
  const confirmedPayment = (await readStore("finance_payments")).find(
    (value) => value.payload?.id === paymentFixture.id,
  )?.payload;
  const paidObligation = (await readStore("finance_obligations")).find(
    (value) => value.payload?.id === paymentFixture.obligationId,
  )?.payload;
  expect(confirmedPayment?.status === "CONFIRMED", "Dekont onayı ödemeyi CONFIRMED yapmadı.");
  expect(paidObligation?.status === "PAID", "Tam ödenen yükümlülük PAID durumuna geçmedi.");
  expect(
    (await readStore("finance_transactions")).length === transactionCountBeforeReceipt,
    "Dekont onayı ikinci bir gider/ledger hareketi oluşturdu.",
  );
  expect(
    (await readStore("finance_transfers")).length === transferCountBeforeReceipt,
    "Dekont onayı ikinci bir transfer oluşturdu.",
  );
  await page.getByRole("button", { name: "Bu dekontla ödemeyi onayla" }).click();
  await waitForIdle();
  expect(
    (await readStore("finance_payments")).filter(
      (value) => value.payload?.id === paymentFixture.id && value.payload?.status === "CONFIRMED",
    ).length === 1,
    "Aynı dekont ikinci kez ödeme onayı üretti.",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(
    viewport.width <= viewport.viewport + 1,
    "Mobil inceleme ekranında kritik yatay taşma var.",
  );

  expect(
    remoteRequests.length === 0,
    `Yerel OCR dış ağ isteği yaptı: ${remoteRequests.join(", ")}`,
  );
  expect(consoleErrors.length === 0, `Tarayıcı konsol hataları: ${consoleErrors.join(" | ")}`);
  console.log("Finance OCR browser validation passed", { remoteRequests, consoleErrors });
} catch (error) {
  console.error("Finance OCR browser validation failed", {
    message: String(error),
    url: page.url(),
    body: await page
      .locator("body")
      .innerText()
      .catch(() => "<body unavailable>"),
    consoleErrors,
  });
  throw error;
} finally {
  await browser.close();
}
