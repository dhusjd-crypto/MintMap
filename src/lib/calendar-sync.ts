import { calendarSyncPush, calendarSyncPull, calendarDeleteEvent } from "./google/calendar";
import { mindmap } from "./mindmap-store";

/**
 * Two-way Google Calendar sync for tasks with dueAt.
 * Push: local → Google (create/patch).
 * Pull: fetch existing linked events, detect deletions or time changes.
 */
export async function runCalendarSync(): Promise<{ pushed: number; pulled: number; errors: number }> {
  const all = mindmap.allTodos();

  // Push: any todo with dueAt (not done or done<30d) → upsert event.
  const cutoff = Date.now() - 30 * 86400_000;
  const pushables = all.filter(
    (x) => !!x.todo.dueAt && (!x.todo.done || (x.todo.completedAt ?? 0) > cutoff),
  );
  const pushItems = pushables.map((x) => ({
    key: `${x.wsId}:${x.nodeId}:${x.todo.id}`,
    title: x.todo.text,
    description: `MintMap · ${x.wsName} · ${x.nodeTitle}`,
    startISO: new Date(x.todo.dueAt!).toISOString(),
    googleEventId: x.todo.googleEventId,
  }));

  let pushed = 0;
  let errors = 0;
  if (pushItems.length) {
    const r = await calendarSyncPush({ data: { items: pushItems } });
    r.results.forEach((res) => {
      const item = pushables.find((x) => `${x.wsId}:${x.nodeId}:${x.todo.id}` === res.key);
      if (!item) return;
      if (res.error) {
        errors++;
        return;
      }
      pushed++;
      mindmap.updateTodoIn(item.wsId, item.nodeId, item.todo.id, {
        googleEventId: res.googleEventId,
        syncedAt: Date.now(),
      });
    });
  }

  // Pull: check existing linked events for changes/deletion.
  const linked = mindmap.allTodos().filter((x) => !!x.todo.googleEventId);
  const eventIds = linked.map((x) => x.todo.googleEventId!);
  let pulled = 0;
  if (eventIds.length) {
    const r = await calendarSyncPull({ data: { eventIds } });
    r.updates.forEach((u) => {
      const match = linked.find((x) => x.todo.googleEventId === u.googleEventId);
      if (!match) return;
      if (u.status === "missing" || u.status === "cancelled") {
        mindmap.updateTodoIn(match.wsId, match.nodeId, match.todo.id, {
          googleEventId: undefined,
          syncedAt: Date.now(),
        });
        pulled++;
        return;
      }
      if (u.startISO) {
        const remote = Date.parse(u.startISO);
        if (Number.isFinite(remote) && remote !== match.todo.dueAt) {
          mindmap.updateTodoIn(match.wsId, match.nodeId, match.todo.id, {
            dueAt: remote,
            syncedAt: Date.now(),
          });
          pulled++;
        }
      }
    });
  }

  return { pushed, pulled, errors };
}

/** Delete a single event by id (best-effort). */
export async function removeCalendarEvent(eventId: string): Promise<void> {
  try {
    await calendarDeleteEvent({ data: { eventId } });
  } catch {
    /* ignore */
  }
}

const AUTO_KEY = "mintmap.calendar.auto";
const LAST_KEY = "mintmap.calendar.lastSyncAt";
const INTERVAL = 15 * 60_000;

/** Kick off a polling loop when auto-sync is enabled. Safe to call once at app start. */
export function useAutoCalendarSync() {
  if (typeof window === "undefined") return;
  const enabled = localStorage.getItem(AUTO_KEY) === "on";
  if (!enabled) return;
  const tick = async () => {
    try {
      const r = await runCalendarSync();
      localStorage.setItem(LAST_KEY, String(Date.now()));
      if (r.errors) console.warn("[calendar-sync] errors:", r.errors);
    } catch (e) {
      console.warn("[calendar-sync] failed:", (e as Error).message);
    }
  };
  window.setTimeout(tick, 10_000);
  window.setInterval(tick, INTERVAL);
}
