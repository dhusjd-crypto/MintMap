import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type DragEvent } from "react";
import {
  Columns3,
  Circle,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Bell,
  Repeat,
  ListChecks,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { TaskSheet } from "@/components/TaskSheet";
import { mindmap, useNodes, type Todo, type TodoStatus } from "@/lib/mindmap-store";

export const Route = createFileRoute("/board")({
  head: () => ({
    meta: [
      { title: "Pano — MintMap" },
      { name: "description", content: "Tüm görevlerini kanban panosunda yönet." },
    ],
  }),
  component: BoardPage,
});

type Card = { nodeId: string; nodeTitle: string; nodeColor: string; todo: Todo };

const COLUMNS: { id: TodoStatus; title: string; icon: typeof Circle; accent: string }[] = [
  { id: "todo",  title: "Yapılacak", icon: Circle,        accent: "from-sky-500/20 to-sky-500/0" },
  { id: "doing", title: "Devam",     icon: Loader2,       accent: "from-amber-500/20 to-amber-500/0" },
  { id: "done",  title: "Tamamlandı",icon: CheckCircle2,  accent: "from-emerald-500/20 to-emerald-500/0" },
];

function statusOf(t: Todo): TodoStatus {
  if (t.status) return t.status;
  return t.done ? "done" : "todo";
}

function BoardPage() {
  const nodes = useNodes();
  const [openTodo, setOpenTodo] = useState<{ nodeId: string; todoId: string } | null>(null);
  const [dragOver, setDragOver] = useState<TodoStatus | null>(null);

  const cards: Card[] = useMemo(() => {
    const out: Card[] = [];
    nodes.forEach((n) =>
      n.todos.forEach((t) => out.push({ nodeId: n.id, nodeTitle: n.title, nodeColor: n.color, todo: t })),
    );
    return out;
  }, [nodes]);

  const byCol = useMemo(() => {
    const map: Record<TodoStatus, Card[]> = { todo: [], doing: [], done: [] };
    cards.forEach((c) => map[statusOf(c.todo)].push(c));
    // Sort: starred first, then earliest due, then newest
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => {
        if (!!b.todo.starred !== !!a.todo.starred) return b.todo.starred ? 1 : -1;
        if (a.todo.dueAt && b.todo.dueAt) return a.todo.dueAt - b.todo.dueAt;
        if (a.todo.dueAt) return -1;
        if (b.todo.dueAt) return 1;
        return (b.todo.createdAt ?? 0) - (a.todo.createdAt ?? 0);
      }),
    );
    return map;
  }, [cards]);

  const onDragStart = (e: DragEvent, c: Card) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ nodeId: c.nodeId, todoId: c.todo.id }));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: DragEvent, status: TodoStatus) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const { nodeId, todoId } = JSON.parse(e.dataTransfer.getData("application/json"));
      mindmap.setTodoStatus(nodeId, todoId, status);
    } catch {}
  };

  return (
    <main className="flex h-svh flex-col">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-leaf">
            <Columns3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">Pano</h1>
            <p className="text-[11px] text-muted-foreground">{cards.length} görev</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden px-3 pb-3">
        <div className="grid h-full grid-cols-3 gap-2">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            const items = byCol[col.id];
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col.id);
                }}
                onDragLeave={() => setDragOver((v) => (v === col.id ? null : v))}
                onDrop={(e) => onDrop(e, col.id)}
                className={`flex min-h-0 flex-col rounded-2xl border bg-card/40 transition ${
                  dragOver === col.id ? "border-primary ring-2 ring-primary/30" : "border-border/40"
                }`}
              >
                <div className={`flex items-center justify-between rounded-t-2xl bg-gradient-to-b ${col.accent} px-3 py-2`}>
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{col.title}</span>
                  </div>
                  <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-medium text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5">
                  {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/50 p-3 text-center text-[11px] text-muted-foreground">
                      Boş
                    </div>
                  ) : (
                    items.map((c) => {
                      const stepsDone = (c.todo.steps ?? []).filter((s) => s.done).length;
                      const stepsTotal = (c.todo.steps ?? []).length;
                      const overdue =
                        c.todo.dueAt && c.todo.dueAt < Date.now() && statusOf(c.todo) !== "done";
                      return (
                        <button
                          key={c.todo.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, c)}
                          onClick={() => setOpenTodo({ nodeId: c.nodeId, todoId: c.todo.id })}
                          className="block w-full rounded-lg bg-background p-2 text-left text-xs shadow-soft transition hover:ring-1 hover:ring-primary/40"
                        >
                          <div className="flex items-start gap-1.5">
                            <span
                              className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                              style={{ background: c.nodeColor }}
                            />
                            <div className="min-w-0 flex-1">
                              <div
                                className={`break-words text-[12px] font-medium leading-snug ${
                                  c.todo.done ? "text-muted-foreground line-through" : ""
                                }`}
                              >
                                {c.todo.text}
                              </div>
                              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                {c.nodeTitle}
                              </div>
                            </div>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                            {c.todo.starred && <span className="text-amber-500">★</span>}
                            {overdue && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-rose-600 dark:text-rose-400">
                                <AlertTriangle className="h-2.5 w-2.5" /> gecikmiş
                              </span>
                            )}
                            {c.todo.dueAt && !overdue && (
                              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                <Clock className="h-2.5 w-2.5" />
                                {new Date(c.todo.dueAt).toLocaleDateString("tr-TR", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                            )}
                            {c.todo.reminderAt && <Bell className="h-2.5 w-2.5 text-muted-foreground" />}
                            {c.todo.recurrence && <Repeat className="h-2.5 w-2.5 text-muted-foreground" />}
                            {stepsTotal > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                <ListChecks className="h-2.5 w-2.5" />
                                {stepsDone}/{stepsTotal}
                              </span>
                            )}
                          </div>
                          {c.todo.tags && c.todo.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-0.5">
                              {c.todo.tags.slice(0, 3).map((t, i) => (
                                <span
                                  key={`${t}-${i}`}
                                  className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-1.5 flex items-center justify-between gap-1">
                            <div className="flex gap-0.5">
                              {COLUMNS.filter((x) => x.id !== col.id).map((x) => (
                                <span
                                  key={x.id}
                                  role="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    mindmap.setTodoStatus(c.nodeId, c.todo.id, x.id);
                                  }}
                                  className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground hover:bg-primary/15 hover:text-primary"
                                  title={`'${x.title}' sütununa taşı`}
                                >
                                  → {x.title}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
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
