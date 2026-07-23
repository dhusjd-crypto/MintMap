import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Clock,
  Repeat,
  Bell,
  ListChecks,
} from "lucide-react";

type Status = "done" | "overdue" | "today" | "upcoming";

const STATUS_META: Record<Status, { dot: string; bar: string; chip: string; label: string }> = {
  overdue:  { dot: "bg-rose-500",   bar: "bg-rose-500",   chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400",       label: "Gecikmiş" },
  today:    { dot: "bg-amber-500",  bar: "bg-amber-500",  chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",    label: "Bugün" },
  upcoming: { dot: "bg-sky-500",    bar: "bg-sky-500",    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400",          label: "Yaklaşan" },
  done:     { dot: "bg-emerald-500",bar: "bg-emerald-500",chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",label: "Tamamlandı" },
};

function statusOf(todo: { done: boolean; dueAt?: number }, ref: Date): Status {
  if (todo.done) return "done";
  if (!todo.dueAt) return "upcoming";
  const d = new Date(todo.dueAt);
  if (sameDay(todo.dueAt, ref)) return "today";
  if (d.getTime() < ref.setHours(0, 0, 0, 0)) return "overdue";
  return "upcoming";
}

const TAG_PALETTE = [
  "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "bg-pink-500/15 text-pink-600 dark:text-pink-300",
  "bg-teal-500/15 text-teal-600 dark:text-teal-300",
  "bg-orange-500/15 text-orange-600 dark:text-orange-300",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  "bg-lime-500/15 text-lime-700 dark:text-lime-300",
];
function tagClass(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}
import { BottomNav } from "@/components/BottomNav";
import { mindmap, useNodes, type Todo } from "@/lib/mindmap-store";
import { TaskSheet } from "@/components/TaskSheet";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Takvim — MintMap" },
      { name: "description", content: "Görevlerini tarihe göre takvimde gör." },
    ],
  }),
  component: CalendarPage,
});

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameDay(a: number, b: Date) {
  const d = new Date(a);
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate();
}

function CalendarPage() {
  const nodes = useNodes();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(new Date());
  const [openTodo, setOpenTodo] = useState<{ nodeId: string; todoId: string } | null>(null);

  const todos = useMemo(() => {
    const out: { nodeId: string; nodeTitle: string; todo: Todo }[] = [];
    nodes.forEach((n) =>
      n.todos.forEach((t) => {
        if (t.dueAt) out.push({ nodeId: n.id, nodeTitle: n.title, todo: t });
      }),
    );
    return out;
  }, [nodes]);

  const monthGrid = useMemo(() => {
    const first = startOfMonth(cursor);
    const startDay = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const today = useMemo(() => new Date(), []);

  const statusByDay = useMemo(() => {
    const map = new Map<string, Set<Status>>();
    todos.forEach(({ todo }) => {
      const d = new Date(todo.dueAt!);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const s = statusOf(todo, new Date(today));
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(s);
    });
    return map;
  }, [todos, today]);

  const dayTodos = todos.filter(({ todo }) => sameDay(todo.dueAt!, selected));
  const dayStats = useMemo(() => {
    const acc: Record<Status, number> = { overdue: 0, today: 0, upcoming: 0, done: 0 };
    dayTodos.forEach(({ todo }) => {
      acc[statusOf(todo, new Date(today))]++;
    });
    return acc;
  }, [dayTodos, today]);

  const monthLabel = cursor.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-leaf">
            <CalendarDays className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold">Takvim</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded-lg p-1.5 hover:bg-accent"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label="Önceki ay"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[10ch] text-center text-sm font-medium capitalize">{monthLabel}</div>
          <button
            className="rounded-lg p-1.5 hover:bg-accent"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label="Sonraki ay"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="shrink-0 px-5">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const statuses = statusByDay.get(key);
            const isToday = sameDay(Date.now(), d);
            const isSel = sameDay(selected.getTime(), d);
            const order: Status[] = ["overdue", "today", "upcoming", "done"];
            const dots = statuses ? order.filter((s) => statuses.has(s)) : [];
            return (
              <button
                key={i}
                onClick={() => setSelected(d)}
                className={`relative flex h-14 flex-col items-center justify-center rounded-lg text-sm transition-colors sm:h-20 ${
                  isSel ? "bg-primary text-primary-foreground" : isToday ? "bg-accent" : "hover:bg-accent/60"
                }`}
              >
                <span>{d.getDate()}</span>
                {dots.length > 0 && (
                  <span className="mt-0.5 flex items-center gap-0.5">
                    {dots.map((s) => (
                      <span
                        key={s}
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSel ? "bg-primary-foreground/80" : STATUS_META[s].dot
                        }`}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {selected.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
          </h2>
          <div className="flex flex-wrap gap-1">
            {(["overdue", "today", "upcoming", "done"] as Status[]).map((s) =>
              dayStats[s] > 0 ? (
                <span
                  key={s}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_META[s].chip}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`} />
                  {STATUS_META[s].label} {dayStats[s]}
                </span>
              ) : null,
            )}
          </div>
        </div>
        {dayTodos.length === 0 ? (
          <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground shadow-soft">
            Bu gün için görev yok.
          </p>
        ) : (
          <ul className="space-y-2">
            {dayTodos.map(({ nodeId, nodeTitle, todo }) => {
              const status = statusOf(todo, new Date(today));
              const meta = STATUS_META[status];
              const StatusIcon =
                status === "overdue" ? AlertTriangle
                : status === "today" ? Flame
                : status === "done" ? CheckCircle2
                : Clock;
              const steps = todo.steps ?? [];
              const stepsDone = steps.filter((s) => s.done).length;
              const timeLabel = todo.dueAt
                ? new Date(todo.dueAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
                : null;
              return (
                <li key={todo.id}>
                  <button
                    onClick={() => setOpenTodo({ nodeId, todoId: todo.id })}
                    className="relative flex w-full items-start gap-3 overflow-hidden rounded-xl bg-card p-3 pl-4 text-left shadow-soft hover:bg-accent/40"
                  >
                    <span className={`absolute left-0 top-0 h-full w-1 ${meta.bar}`} />
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        mindmap.toggleTodo(nodeId, todo.id);
                      }}
                      className="mt-0.5"
                    >
                      {todo.done ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <div
                          className={`min-w-0 flex-1 truncate text-sm ${
                            todo.done ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {todo.text}
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="truncate">{nodeTitle}</span>
                        {timeLabel && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" /> {timeLabel}
                          </span>
                        )}
                        {todo.reminderAt && (
                          <span className="inline-flex items-center gap-0.5">
                            <Bell className="h-3 w-3" />
                          </span>
                        )}
                        {todo.recurrence && (
                          <span className="inline-flex items-center gap-0.5">
                            <Repeat className="h-3 w-3" />
                            {todo.recurrence === "daily" ? "günlük" : todo.recurrence === "weekly" ? "haftalık" : "aylık"}
                          </span>
                        )}
                        {steps.length > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <ListChecks className="h-3 w-3" />
                            {stepsDone}/{steps.length}
                          </span>
                        )}
                      </div>
                      {todo.tags && todo.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {todo.tags.map((t, i) => (
                            <span
                              key={`${t}-${i}`}
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tagClass(t)}`}
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/todos" className="underline">Tüm görevler →</Link>
        </div>
      </div>

      <BottomNav />
      {openTodo && (
        <TaskSheet
          nodeId={openTodo.nodeId}
          todoId={openTodo.todoId}
          onClose={() => setOpenTodo(null)}
        />
      )}
    </main>
  );
}
