// Cross-workspace reminder scheduler.
// - Scans every todo with a reminderAt (and the legacy node-level reminderAt).
// - Schedules a single setTimeout for the next reminder within the rescan window.
// - On fire: shows a Notification, advances reminderAt for recurring tasks
//   (rescheduling automatically), and falls back to a toast if permission is missing.
// - Re-runs on every store change and at a fixed interval so newly added reminders
//   are picked up immediately.

import { toast } from "sonner";
import { mindmap, type Recurrence } from "./mindmap-store";

const RESCAN_MS = 60_000; // re-sweep at most every minute
const LOOKAHEAD_MS = 1000 * 60 * 60 * 6; // schedule timers up to 6h out
const STORAGE_FIRED = "mintmap.reminders.fired.v1";

type FiredMap = Record<string, number>; // key -> ts (last fired)
let fired: FiredMap = loadFired();
let timer: ReturnType<typeof setTimeout> | null = null;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let started = false;

function loadFired(): FiredMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_FIRED);
    if (!raw) return {};
    const obj = JSON.parse(raw) as FiredMap;
    // Garbage-collect entries older than 30 days.
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
    Object.keys(obj).forEach((k) => obj[k] < cutoff && delete obj[k]);
    return obj;
  } catch {
    return {};
  }
}

function persistFired() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_FIRED, JSON.stringify(fired));
  } catch {
    /* ignore */
  }
}

function advance(ts: number, r: Recurrence): number {
  const d = new Date(ts);
  if (r === "daily") d.setDate(d.getDate() + 1);
  else if (r === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

function fireFor(payload: {
  wsId: string;
  nodeId: string;
  nodeTitle: string;
  todoId: string;
  title: string;
  ts: number;
  recurrence?: Recurrence;
}) {
  const key = `${payload.wsId}:${payload.nodeId}:${payload.todoId}:${payload.ts}`;
  if (fired[key]) return;
  fired[key] = Date.now();
  persistFired();

  const body = payload.nodeTitle ? `${payload.nodeTitle} · ${payload.title}` : payload.title;

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification("🌿 MintMap hatırlatma", {
        body,
        tag: `${payload.wsId}:${payload.todoId}`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      toast(payload.title, { description: payload.nodeTitle });
    }
  } else {
    toast(`🌿 ${payload.title}`, { description: payload.nodeTitle });
  }

  // Advance reminderAt for recurring todos so the next occurrence is scheduled.
  if (payload.recurrence) {
    let next = advance(payload.ts, payload.recurrence);
    const now = Date.now();
    while (next < now) next = advance(next, payload.recurrence);
    mindmap.updateTodoIn(payload.wsId, payload.nodeId, payload.todoId, { reminderAt: next });
  }
}

function sweep() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const now = Date.now();
  const horizon = now + LOOKAHEAD_MS;
  const list = mindmap.allTodos();
  let nextDelay: number | null = null;

  for (const entry of list) {
    const { todo } = entry;
    const ts = todo.reminderAt;
    if (!ts || todo.done) continue;
    const key = `${entry.wsId}:${entry.nodeId}:${todo.id}:${ts}`;

    if (ts <= now) {
      if (!fired[key] && now - ts < 1000 * 60 * 60 * 24) {
        fireFor({
          wsId: entry.wsId,
          nodeId: entry.nodeId,
          nodeTitle: entry.nodeTitle,
          todoId: todo.id,
          title: todo.text,
          ts,
          recurrence: todo.recurrence,
        });
      }
      continue;
    }

    if (ts <= horizon) {
      const delay = ts - now;
      if (nextDelay === null || delay < nextDelay) nextDelay = delay;
    }
  }

  if (nextDelay !== null) {
    timer = setTimeout(() => {
      timer = null;
      sweep();
    }, nextDelay + 250);
  }
}

export function initReminderScheduler() {
  if (started || typeof window === "undefined") return;
  started = true;
  // Initial sweep slightly delayed so the UI mounts first.
  setTimeout(sweep, 1500);
  unsubscribe = mindmap.subscribeAll(() => sweep());
  sweepTimer = setInterval(sweep, RESCAN_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sweep();
  });
}

export function stopReminderScheduler() {
  started = false;
  if (timer) clearTimeout(timer);
  if (sweepTimer) clearInterval(sweepTimer);
  if (unsubscribe) unsubscribe();
  timer = null;
  sweepTimer = null;
  unsubscribe = null;
}
