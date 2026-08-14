import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "../..");
const port = Number(process.env.MINTMAP_E2E_PORT ?? 5186);
const url = `http://127.0.0.1:${port}`;
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(chrome)) throw new Error(`Chrome bulunamadı: ${chrome}`);
const vite = resolve(root, "node_modules/vite/bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: root, stdio: "ignore", windowsHide: true },
);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
async function ready() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${url}/views/now`)).ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error("Smart Views için güncel Vite sunucusu açılamadı.");
}

const now = Date.now();
const expected = {
  now: "sv-now",
  "top-3": "sv-top-1",
  today: "sv-today",
  week: "sv-week",
  waiting: "sv-waiting",
  "follow-up": "sv-follow-up",
  stale: "sv-stale",
  "deadline-risk": "sv-risk",
  blocked: "sv-blocked",
  blocking: "sv-blocker",
  "quick-wins": "sv-quick",
  office: "sv-office",
  phone: "sv-phone",
  outside: "sv-outside",
  "low-energy": "sv-low",
  "deep-work": "sv-deep",
  someday: "sv-someday",
  completed: "sv-completed",
};

let browser;
try {
  await ready();
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((stamp) => {
    localStorage.setItem("mintmap:unlocked", "1");
    if (localStorage.getItem("smart-views-browser-fixture")) return;
    localStorage.setItem("smart-views-browser-fixture", "1");
    const todo = (id, patch = {}) => ({
      id,
      text: id,
      done: false,
      status: "todo",
      createdAt: stamp - 1_000,
      updatedAt: stamp - 1_000,
      estimateMin: 30,
      ...patch,
    });
    const todos = [
      todo("sv-now", { dueAt: stamp + 60_000, priority: 1 }),
      todo("sv-top-1", { myDayAt: stamp, priority: 1 }),
      todo("sv-top-2", { myDayAt: stamp, priority: 2 }),
      todo("sv-top-3", { myDayAt: stamp, priority: 3 }),
      todo("sv-today", { myDayAt: stamp }),
      todo("sv-week", { dueAt: stamp + 3 * 86400000 }),
      todo("sv-waiting"),
      todo("sv-follow-up"),
      todo("sv-stale", { createdAt: stamp - 8 * 86400000, updatedAt: stamp - 8 * 86400000 }),
      todo("sv-risk", { dueAt: stamp + 2 * 86400000 }),
      todo("sv-blocker"),
      todo("sv-blocked", { blockedBy: ["sv-blocker"] }),
      todo("sv-quick", { estimateMin: 10 }),
      todo("sv-office"),
      todo("sv-phone"),
      todo("sv-outside"),
      todo("sv-low"),
      todo("sv-deep", { estimateMin: 60 }),
      todo("sv-someday"),
      todo("sv-completed", { done: true, status: "done", completedAt: stamp - 1 }),
    ];
    localStorage.setItem(
      "mindgrove.v2",
      JSON.stringify({
        currentId: "sv-workspace",
        workspaces: [
          {
            id: "sv-workspace",
            name: "smart-views-browser",
            nodes: [
              {
                id: "sv-node",
                parentId: null,
                title: "Smart Views",
                note: "",
                color: "#000",
                x: 0,
                y: 0,
                todos,
                createdAt: stamp,
              },
            ],
          },
        ],
      }),
    );
  }, now);
  const page = await context.newPage();
  const errors = [],
    remote = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(url))
      remote.push(request.url());
  });
  const expect = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.goto(`${url}/views/now`);
  await page.waitForTimeout(800);
  await page.evaluate(async (stamp) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("mintmap-canonical", 8);
      request.onupgradeneeded = () => {
        [
          "meta",
          "execution_extensions",
          "finance_books",
          "finance_institutions",
          "finance_accounts",
          "finance_categories",
          "finance_payees",
          "finance_transactions",
          "finance_transfers",
          "finance_obligations",
          "finance_payments",
          "finance_statements",
          "finance_schedules",
          "migration_journal",
          "persistence_operations",
          "notification_intents",
          "notification_history",
          "notification_schedule",
          "focus_sessions",
          "routine_sessions",
          "rollover_decisions",
          "capture_items",
          "capture_proposals",
          "capture_document_refs",
          "capture_document_content",
          "finance_capture_proposals",
          "finance_import_batches",
          "finance_import_rows",
          "reconciliation_sessions",
          "expected_cashflow_items",
          "budgets",
          "budget_allocations",
          "financial_goals",
        ].forEach((store) => {
          if (!request.result.objectStoreNames.contains(store))
            request.result.createObjectStore(store, { keyPath: "id" });
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const values = {
      "sv-waiting": { state: "WAITING", waitingFor: "Yanıt", followUpAt: stamp + 86400000 },
      "sv-follow-up": { state: "WAITING", waitingFor: "Yanıt", followUpAt: stamp - 60_000 },
      "sv-stale": { lastTouchedAt: stamp - 8 * 86400000 },
      "sv-blocked": { state: "BLOCKED", blockedBy: [{ taskId: "sv-blocker" }] },
      "sv-office": { context: "OFFICE" },
      "sv-phone": { context: "PHONE" },
      "sv-outside": { context: "OUTSIDE" },
      "sv-low": { energyRequirement: "LOW" },
      "sv-deep": { energyRequirement: "HIGH" },
      "sv-someday": { state: "SOMEDAY" },
      "sv-completed": { state: "DONE", completedAt: stamp - 1 },
    };
    await Promise.all(
      Object.entries(values).map(
        ([taskId, patch]) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction("execution_extensions", "readwrite");
            tx.objectStore("execution_extensions").put({
              id: taskId,
              entityType: "ExecutionTaskExtension",
              schemaVersion: 1,
              revision: 1,
              createdAt: stamp,
              updatedAt: stamp,
              payload: { taskId, schemaVersion: 1, ...patch },
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          }),
      ),
    );
    await new Promise((resolve, reject) => {
      const tx = db.transaction("routine_sessions", "readwrite");
      tx.objectStore("routine_sessions").put({
        id: "MORNING_PLANNING:fixture",
        entityType: "RoutineSession",
        schemaVersion: 1,
        revision: 1,
        createdAt: stamp,
        updatedAt: stamp,
        payload: {
          id: "MORNING_PLANNING:fixture",
          type: "MORNING_PLANNING",
          status: "ACTIVE",
          localDate: "fixture",
          startedAt: stamp,
          createdAt: stamp,
          updatedAt: stamp,
          modelVersion: "ROUTINE_MODEL_V1",
        },
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, now);
  for (const [view, taskId] of Object.entries(expected)) {
    await page.goto(`${url}/views/${view}`);
    await page.getByText(taskId, { exact: true }).waitFor();
    expect(
      (await page.getByText(taskId, { exact: true }).count()) === 1,
      `${view} görünümü ${taskId} kaydını göstermedi.`,
    );
  }
  await page.goto(`${url}/views/now`);
  await page.getByLabel("sv-now tamamla").click();
  await page.waitForTimeout(300);
  await page.goto(`${url}/views/completed`);
  await page.getByText("sv-now", { exact: true }).waitFor();
  await page.goto(`${url}/command-center`);
  await page.getByText("Operasyon görünümleri").waitFor();
  await page.getByText("Güne başla").waitFor();
  expect(errors.length === 0, `Konsol hataları: ${errors.join(" | ")}`);
  expect(remote.length === 0, `Beklenmeyen ağ isteği: ${remote.join(" | ")}`);
  console.log(`Smart Views browser validation passed at ${url}`);
  await context.close();
} finally {
  await browser?.close();
  server.kill();
}
