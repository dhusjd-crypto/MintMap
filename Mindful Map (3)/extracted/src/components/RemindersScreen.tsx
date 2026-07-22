import { useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, BellRing, CalendarClock, Repeat, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mindmap, type Recurrence, type Todo } from "@/lib/mindmap-store";
import { ensureNotificationPermission } from "@/lib/pwa";

type Row = {
  wsId: string;
  wsName: string;
  nodeId: string;
  nodeTitle: string;
  todo: Todo;
};

function toLocalInput(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fmtRelative(ts: number, now = Date.now()) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  const past = diff < 0;
  if (min < 1) return past ? "az önce" : "şimdi";
  if (min < 60) return past ? `${min} dk önce` : `${min} dk sonra`;
  const h = Math.round(min / 60);
  if (h < 24) return past ? `${h} sa önce` : `${h} sa sonra`;
  const d = Math.round(h / 24);
  return past ? `${d} g önce` : `${d} g sonra`;
}

function fmtAbs(ts: number) {
  return new Date(ts).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bucket(ts: number, now = Date.now()): "overdue" | "today" | "tomorrow" | "week" | "later" {
  if (ts < now) return "overdue";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((ts - start.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "week";
  return "later";
}

const BUCKETS: Array<{ key: ReturnType<typeof bucket>; label: string; tone: string }> = [
  { key: "overdue", label: "Geçmiş", tone: "text-destructive" },
  { key: "today", label: "Bugün", tone: "text-primary" },
  { key: "tomorrow", label: "Yarın", tone: "text-foreground" },
  { key: "week", label: "Bu hafta", tone: "text-foreground" },
  { key: "later", label: "Daha sonra", tone: "text-muted-foreground" },
];

function useAllTodos(): Row[] {
  return useSyncExternalStore(
    (cb) => mindmap.subscribeAll(cb),
    () => mindmap.allTodos(),
    () => mindmap.allTodos(),
  );
}

export function RemindersScreen({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const rows = useAllTodos();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notifState, setNotifState] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );

  const withReminders = useMemo(
    () =>
      rows
        .filter((r) => !!r.todo.reminderAt && !r.todo.done)
        .sort((a, b) => (a.todo.reminderAt ?? 0) - (b.todo.reminderAt ?? 0)),
    [rows],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    BUCKETS.forEach((b) => map.set(b.key, []));
    withReminders.forEach((r) => {
      const b = bucket(r.todo.reminderAt!);
      map.get(b)!.push(r);
    });
    return map;
  }, [withReminders]);

  const candidates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return [];
    return rows
      .filter((r) => !r.todo.done && !r.todo.reminderAt)
      .filter(
        (r) =>
          r.todo.text.toLocaleLowerCase("tr").includes(q) ||
          r.nodeTitle.toLocaleLowerCase("tr").includes(q),
      )
      .slice(0, 6);
  }, [rows, query]);

  const enableNotifications = async () => {
    const ok = await ensureNotificationPermission();
    setNotifState(ok ? "granted" : (typeof Notification !== "undefined" ? Notification.permission : "denied"));
    if (ok) {
      toast.success("Bildirimler etkin");
      try {
        new Notification("🌿 MintMap", { body: "Hatırlatmalar artık bu cihazda görünecek." });
      } catch {
        /* ignore */
      }
    } else {
      toast.message("Bildirim izni verilmedi");
    }
  };

  const update = (r: Row, patch: Partial<Todo>) =>
    mindmap.updateTodoIn(r.wsId, r.nodeId, r.todo.id, patch);

  const setQuick = (r: Row, offsetMin: number) => {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + offsetMin);
    update(r, { reminderAt: d.getTime() });
  };

  const setTomorrow9 = (r: Row) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    update(r, { reminderAt: d.getTime() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-2 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            Hatırlatmalar
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              {notifState === "granted" ? (
                <>
                  <Bell className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Bildirimler aktif</span>
                </>
              ) : notifState === "denied" ? (
                <>
                  <BellOff className="h-4 w-4 text-destructive" />
                  <span className="text-destructive">Bildirim izni reddedildi</span>
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Bildirim izni gerekli</span>
                </>
              )}
            </div>
            {notifState !== "granted" && (
              <Button size="sm" onClick={enableNotifications} disabled={notifState === "denied"}>
                İzin ver
              </Button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hatırlatma eklenecek görevi ara..."
              className="pl-8 h-9"
            />
            {candidates.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-leaf">
                {candidates.map((c) => (
                  <button
                    key={`${c.wsId}-${c.nodeId}-${c.todo.id}`}
                    onClick={() => {
                      setTomorrow9(c);
                      setEditingId(c.todo.id);
                      setQuery("");
                      toast.success("Hatırlatma eklendi (yarın 09:00)");
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <CalendarClock className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.todo.text}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {c.nodeTitle} · {c.wsName}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {withReminders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Henüz hatırlatma planlanmadı. Bir görevi arayıp ekleyebilirsiniz.
            </div>
          ) : (
            BUCKETS.map((b) => {
              const items = grouped.get(b.key) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={b.key}>
                  <h3 className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${b.tone}`}>
                    {b.label} · {items.length}
                  </h3>
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {items.map((r) => (
                        <ReminderCard
                          key={`${r.wsId}-${r.nodeId}-${r.todo.id}`}
                          row={r}
                          open={editingId === r.todo.id}
                          onToggle={() => setEditingId(editingId === r.todo.id ? null : r.todo.id)}
                          onUpdate={(patch) => update(r, patch)}
                          onQuick={(min) => setQuick(r, min)}
                          onClear={() => update(r, { reminderAt: undefined, recurrence: undefined })}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReminderCard({
  row,
  open,
  onToggle,
  onUpdate,
  onQuick,
  onClear,
}: {
  row: Row;
  open: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<Todo>) => void;
  onQuick: (offsetMin: number) => void;
  onClear: () => void;
}) {
  const { todo } = row;
  const ts = todo.reminderAt!;
  const overdue = ts < Date.now();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            overdue ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
          }`}
        >
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{todo.text}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {row.nodeTitle} · {row.wsName}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xs font-semibold ${overdue ? "text-destructive" : "text-foreground"}`}>
            {fmtRelative(ts)}
          </div>
          <div className="text-[10px] text-muted-foreground">{fmtAbs(ts)}</div>
          {todo.recurrence && (
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-primary">
              <Repeat className="h-3 w-3" />
              {todo.recurrence === "daily"
                ? "her gün"
                : todo.recurrence === "weekly"
                  ? "her hafta"
                  : "her ay"}
            </div>
          )}
        </div>
      </button>

      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-border"
        >
          <div className="space-y-3 px-3 py-3">
            <div className="flex flex-wrap gap-1.5">
              <QuickChip label="10 dk" onClick={() => onQuick(10)} />
              <QuickChip label="1 saat" onClick={() => onQuick(60)} />
              <QuickChip label="3 saat" onClick={() => onQuick(180)} />
              <QuickChip
                label="Bugün 18:00"
                onClick={() => {
                  const d = new Date();
                  d.setHours(18, 0, 0, 0);
                  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
                  onUpdate({ reminderAt: d.getTime() });
                }}
              />
              <QuickChip
                label="Yarın 09:00"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(9, 0, 0, 0);
                  onUpdate({ reminderAt: d.getTime() });
                }}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tarih ve saat
              </label>
              <Input
                type="datetime-local"
                value={toLocalInput(ts)}
                onChange={(e) => {
                  const v = e.target.value;
                  onUpdate({ reminderAt: v ? new Date(v).getTime() : undefined });
                }}
                className="h-9"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tekrar sıklığı
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(["daily", "weekly", "monthly"] as Recurrence[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => onUpdate({ recurrence: todo.recurrence === r ? undefined : r })}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      todo.recurrence === r
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground hover:bg-muted/70"
                    }`}
                  >
                    <Repeat className="h-3 w-3" />
                    {r === "daily" ? "Her gün" : r === "weekly" ? "Her hafta" : "Her ay"}
                  </button>
                ))}
                <button
                  onClick={() => onUpdate({ recurrence: undefined })}
                  className="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  Tek seferlik
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={onClear}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                <X className="h-3.5 w-3.5" />
                Hatırlatmayı kaldır
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function QuickChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70"
    >
      {label}
    </button>
  );
}
