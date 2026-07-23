import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  FileText,
  Flag,
  Home,
  Infinity as InfinityIcon,
  Link2,
  ListChecks,
  Lock,
  Menu,
  Plus,
  Search,
  Sparkles,
  Star,
  Sun,
  CalendarDays,
  Bell,
  Tag,
  Flame,
  AlertTriangle,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { BottomNav } from "@/components/BottomNav";
import { TaskSheet } from "@/components/TaskSheet";
import { TodoStats } from "@/components/TodoStats";
import { MarkdownNote } from "@/components/MarkdownNote";
import { LazyNodeImagePanel as NodeImagePanel } from "@/components/LazyNodeImagePanel";
import { mindmap, useNodes, useReminderScheduler, type MindNode, type Todo } from "@/lib/mindmap-store";
import { parseQuickAdd } from "@/lib/nl-parser";
import { aiPlanDay } from "@/lib/ai.functions";
import { PRIORITY_META, comparePriority, isBlocked } from "@/lib/task-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/todos")({
  head: () => ({
    meta: [
      { title: "Görevler — MintMap" },
      { name: "description", content: "Microsoft To Do tarzı detaylı görev yönetimi." },
    ],
  }),
  component: TodosPage,
});

type View =
  | { kind: "myday" }
  | { kind: "all" }
  | { kind: "starred" }
  | { kind: "planned" }
  | { kind: "today" }
  | { kind: "overdue" }
  | { kind: "highprio" }
  | { kind: "blocked" }
  | { kind: "list"; nodeId: string };

type FlatTodo = { todo: Todo; node: MindNode };


function isToday(ts?: number) {
  if (!ts) return false;
  const d = new Date(ts);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function TodosPage() {
  useReminderScheduler();
  const nodes = useNodes();
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [openTodo, setOpenTodo] = useState<{ nodeId: string; todoId: string } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [plan, setPlan] = useState<{ order: string[]; reasons: Record<string, string> } | null>(null);
  const [liveMsg, setLiveMsg] = useState("");
  const planDay = useServerFn(aiPlanDay);



  const activeNode = view.kind === "list" ? nodes.find((n) => n.id === view.nodeId) : undefined;
  const childNodes = useMemo(
    () => (activeNode ? nodes.filter((n) => n.parentId === activeNode.id) : []),
    [nodes, activeNode],
  );

  const all: FlatTodo[] = useMemo(() => {
    const out: FlatTodo[] = [];
    nodes.forEach((n) => n.todos.forEach((t) => out.push({ todo: t, node: n })));
    return out;
  }, [nodes]);

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((x) =>
      (x.todo.tags ?? []).forEach((t) => m.set(t, (m.get(t) ?? 0) + (x.todo.done ? 0 : 1))),
    );
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const filtered = useMemo(() => {
    let arr = all;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    if (view.kind === "myday") arr = arr.filter((x) => x.todo.myDay);
    else if (view.kind === "starred") arr = arr.filter((x) => x.todo.starred);
    else if (view.kind === "planned") arr = arr.filter((x) => x.todo.dueAt || x.todo.reminderAt);
    else if (view.kind === "today")
      arr = arr.filter(
        (x) =>
          x.todo.myDay ||
          (x.todo.dueAt && x.todo.dueAt >= startOfDay.getTime() && x.todo.dueAt <= endOfDay.getTime()) ||
          (x.todo.reminderAt && x.todo.reminderAt >= startOfDay.getTime() && x.todo.reminderAt <= endOfDay.getTime()),
      );
    else if (view.kind === "overdue")
      arr = arr.filter((x) => !x.todo.done && x.todo.dueAt && x.todo.dueAt < startOfDay.getTime());
    else if (view.kind === "highprio")
      arr = arr.filter((x) => x.todo.priority === 1 || x.todo.priority === 2);
    else if (view.kind === "blocked") arr = arr.filter((x) => isBlocked(x.todo, x.node.todos));
    else if (view.kind === "list") arr = arr.filter((x) => x.node.id === view.nodeId);
    if (tagFilter) arr = arr.filter((x) => x.todo.tags?.includes(tagFilter));
    const q = query.trim().toLowerCase();
    if (q)
      arr = arr.filter(
        (x) =>
          x.todo.text.toLowerCase().includes(q) ||
          (x.todo.note ?? "").toLowerCase().includes(q) ||
          x.node.title.toLowerCase().includes(q) ||
          (x.todo.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
    return arr;
  }, [all, view, query, tagFilter]);

  const activeRaw = useMemo(() => filtered.filter((x) => !x.todo.done), [filtered]);
  const done = useMemo(() => filtered.filter((x) => x.todo.done), [filtered]);

  // Sort active by priority/due unless an AI plan is overriding (myday only).
  const active = useMemo(() => {
    if (view.kind === "myday" && plan) {
      const idx = new Map(plan.order.map((id, i) => [id, i]));
      return [...activeRaw].sort(
        (a, b) => (idx.get(a.todo.id) ?? 999) - (idx.get(b.todo.id) ?? 999),
      );
    }
    return [...activeRaw].sort((a, b) => comparePriority(a.todo, b.todo));
  }, [activeRaw, view.kind, plan]);

  const runSmartPlan = async () => {
    if (activeRaw.length < 2) {
      toast.message("Planlamak için en az 2 görev gerekli");
      return;
    }
    setPlanBusy(true);
    const t = toast.loading("AI günü planlıyor...");
    try {
      const res = await planDay({
        data: {
          items: activeRaw.map((x) => ({
            id: x.todo.id,
            text: x.todo.text,
            dueAt: x.todo.dueAt,
            starred: x.todo.starred,
            estimateMin: x.todo.estimateMin,
            tags: x.todo.tags,
          })),
        },
      });
      const order = res.plan.map((p) => p.id);
      const reasons = Object.fromEntries(res.plan.map((p) => [p.id, p.reason ?? ""]));
      setPlan({ order, reasons });
      toast.success("Plan hazır", { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setPlanBusy(false);
    }
  };

  const viewMeta = useMemo(() => {
    switch (view.kind) {
      case "myday":
        return { title: "Günüm", color: "oklch(0.7 0.13 250)", icon: Sun };
      case "starred":
        return { title: "Önemli", color: "oklch(0.78 0.14 80)", icon: Star };
      case "planned":
        return { title: "Planlandı", color: "oklch(0.72 0.12 30)", icon: CalendarDays };
      case "today":
        return { title: "Bugün", color: "oklch(0.72 0.13 200)", icon: Sun };
      case "overdue":
        return { title: "Gecikmiş", color: "oklch(0.62 0.18 25)", icon: AlertTriangle };
      case "highprio":
        return { title: "Yüksek öncelik", color: "oklch(0.68 0.18 20)", icon: Flag };
      case "blocked":
        return { title: "Engellenen", color: "oklch(0.65 0.05 280)", icon: Lock };
      case "list": {
        const n = nodes.find((x) => x.id === view.nodeId);
        return { title: n?.title ?? "Liste", color: n?.color ?? "oklch(0.7 0.05 220)", icon: ListChecks };
      }
      default:
        return { title: "Tümü", color: "oklch(0.7 0.13 30)", icon: InfinityIcon };
    }
  }, [view, nodes]);

  const counts = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    return {
      all: all.filter((x) => !x.todo.done).length,
      myday: all.filter((x) => x.todo.myDay && !x.todo.done).length,
      starred: all.filter((x) => x.todo.starred && !x.todo.done).length,
      planned: all.filter((x) => (x.todo.dueAt || x.todo.reminderAt) && !x.todo.done).length,
      today: all.filter(
        (x) =>
          !x.todo.done &&
          (x.todo.myDay ||
            (x.todo.dueAt && x.todo.dueAt >= startOfDay.getTime() && x.todo.dueAt <= endOfDay.getTime())),
      ).length,
      overdue: all.filter(
        (x) => !x.todo.done && x.todo.dueAt && x.todo.dueAt < startOfDay.getTime(),
      ).length,
      highprio: all.filter((x) => !x.todo.done && (x.todo.priority === 1 || x.todo.priority === 2)).length,
      blocked: all.filter((x) => !x.todo.done && isBlocked(x.todo, x.node.todos)).length,
    };
  }, [all]);

  const handleAdd = () => {
    const raw = draftText.trim();
    if (!raw) return;
    let nodeId: string | undefined;
    if (view.kind === "list") nodeId = view.nodeId;
    else nodeId = nodes.find((n) => !n.parentId)?.id ?? nodes[0]?.id;
    if (!nodeId) return;

    const parsed = parseQuickAdd(raw);
    const extra: Partial<Todo> = {};
    if (parsed.dueAt) extra.dueAt = parsed.dueAt;
    if (parsed.reminderAt) extra.reminderAt = parsed.reminderAt;
    if (parsed.recurrence) extra.recurrence = parsed.recurrence;
    if (parsed.tags?.length) extra.tags = parsed.tags;
    if (parsed.starred || view.kind === "starred") extra.starred = true;
    if (parsed.priority) extra.priority = parsed.priority;
    else if (view.kind === "highprio") extra.priority = 2;
    if (parsed.myDay || view.kind === "myday" || view.kind === "today") {
      extra.myDay = true;
      extra.myDayAt = Date.now();
    }
    mindmap.addTodo(nodeId, parsed.text, null, extra);

    // Friendly toast if we parsed something
    const hints: string[] = [];
    if (parsed.dueAt) hints.push(new Date(parsed.dueAt).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }));
    if (parsed.recurrence) hints.push(parsed.recurrence === "daily" ? "her gün" : parsed.recurrence === "weekly" ? "her hafta" : "her ay");
    if (parsed.priority) hints.push(PRIORITY_META[parsed.priority].short);
    if (parsed.tags?.length) hints.push(parsed.tags.map((t) => "#" + t).join(" "));
    if (hints.length) toast.success("Eklendi: " + hints.join(" · "));

    setLiveMsg(`Görev eklendi: ${parsed.text}`);
    setDraftText("");
  };

  const ViewIcon = viewMeta.icon;

  return (
    <main className="relative flex h-svh w-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header
        className="relative px-5 pt-6 pb-4 text-white"
        style={{ background: viewMeta.color }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Listeleri aç"
            className="rounded-lg p-1.5 hover:bg-white/15"
          >
            <Menu className="h-5 w-5" />
          </button>
          <ViewIcon className="h-6 w-6" />
          <h1 className="font-display text-2xl font-bold">{viewMeta.title}</h1>
          <button
            onClick={() => setShowStats((v) => !v)}
            aria-label="İstatistikler"
            className={`ml-auto rounded-lg p-1.5 transition-colors ${
              showStats ? "bg-white/20" : "hover:bg-white/15"
            }`}
            title="İstatistikler"
          >
            <Flame className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 ml-9 text-xs opacity-80">
          {active.length} aktif · {done.length} tamamlandı
        </p>
      </header>

      {showStats && (
        <div className="border-b border-border bg-card">
          <TodoStats nodes={nodes} />
        </div>
      )}

      {/* Left sidebar drawer (lists) */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="flex h-svh min-h-0 w-[82%] max-w-sm flex-col p-0">
          <SheetHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base font-bold">Listeler</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-2">
            <NavItem
              icon={<Sun className="h-5 w-5" />}
              label="Günüm"
              count={counts.myday}
              active={view.kind === "myday"}
              onClick={() => {
                setView({ kind: "myday" });
                setNavOpen(false);
              }}
            />
            <NavItem
              icon={<InfinityIcon className="h-5 w-5" />}
              label="Tümü"
              count={counts.all}
              active={view.kind === "all"}
              onClick={() => {
                setView({ kind: "all" });
                setNavOpen(false);
              }}
            />
            <NavItem
              icon={<Star className="h-5 w-5" />}
              label="Önemli"
              count={counts.starred}
              active={view.kind === "starred"}
              onClick={() => {
                setView({ kind: "starred" });
                setNavOpen(false);
              }}
            />
            <NavItem
              icon={<CalendarDays className="h-5 w-5" />}
              label="Planlandı"
              count={counts.planned}
              active={view.kind === "planned"}
              onClick={() => {
                setView({ kind: "planned" });
                setNavOpen(false);
              }}
            />

            <div className="mt-3 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Akıllı listeler
            </div>
            <NavItem
              icon={<Sun className="h-5 w-5" />}
              label="Bugün"
              count={counts.today}
              active={view.kind === "today"}
              onClick={() => { setView({ kind: "today" }); setNavOpen(false); }}
            />
            <NavItem
              icon={<AlertTriangle className="h-5 w-5" />}
              label="Gecikmiş"
              count={counts.overdue}
              active={view.kind === "overdue"}
              onClick={() => { setView({ kind: "overdue" }); setNavOpen(false); }}
            />
            <NavItem
              icon={<Flag className="h-5 w-5" />}
              label="Yüksek öncelik"
              count={counts.highprio}
              active={view.kind === "highprio"}
              onClick={() => { setView({ kind: "highprio" }); setNavOpen(false); }}
            />
            <NavItem
              icon={<Lock className="h-5 w-5" />}
              label="Engellenen"
              count={counts.blocked}
              active={view.kind === "blocked"}
              onClick={() => { setView({ kind: "blocked" }); setNavOpen(false); }}
            />

            {nodes.length > 0 && (
              <>
                <div className="mt-3 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Mindmap düğümleri
                </div>
                {nodes.map((n) => (
                  <NavItem
                    key={n.id}
                    icon={
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: n.color }}
                      />
                    }
                    label={n.title}
                    count={n.todos.filter((t) => !t.done).length}
                    active={view.kind === "list" && view.nodeId === n.id}
                    onClick={() => {
                      setView({ kind: "list", nodeId: n.id });
                      setNavOpen(false);
                    }}
                  />
                ))}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>


      {/* Search */}
      <div className="relative shrink-0 bg-card px-4 pb-3">
        <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Başlık, not veya #etiket ara..."
          className="bg-muted/40 pl-9"
        />
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="shrink-0 flex gap-1.5 overflow-x-auto bg-card px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setTagFilter(null)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              tagFilter === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            Tümü
          </button>
          {allTags.map(([t, c]) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                tagFilter === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/10 text-primary"
              }`}
            >
              <Tag className="h-3 w-3" />
              {t}
              {c > 0 && <span className="opacity-70">·{c}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Smart Plan bar — only on Günüm */}
      {view.kind === "myday" && activeRaw.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 bg-card px-4 pb-2">
          <button
            onClick={runSmartPlan}
            disabled={planBusy}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {planBusy ? "Planlanıyor..." : plan ? "Yeniden planla" : "Akıllı plan"}
          </button>
          {plan && (
            <button
              onClick={() => setPlan(null)}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Sırayı sıfırla
            </button>
          )}
        </div>
      )}

      {/* Task list */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {activeNode && (
          <div className="mb-3 space-y-3">
            <Suspense fallback={<div className="h-24 rounded-xl bg-muted/50 animate-pulse" />}>
              <NodeImagePanel node={activeNode} />
            </Suspense>
            {activeNode.note.trim() && (
              <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  Düğüm notu
                </div>
                <MarkdownNote source={activeNode.note} />
              </div>
            )}
            {childNodes.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  Alt düğümler · {childNodes.length}
                </div>
                <div className="grid gap-1.5">
                  {childNodes.map((c) => {
                    const open = c.todos.filter((t) => !t.done).length;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setView({ kind: "list", nodeId: c.id })}
                        className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                        <span className="flex-1 truncate font-medium">{c.title}</span>
                        {open > 0 && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {open}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {active.length === 0 && done.length === 0 ? (
          <EmptyState viewKind={view.kind} />
        ) : (
          <div className="space-y-2">
            {active.map(({ todo, node }, i) => (
              <TaskRow
                key={todo.id}
                todo={todo}
                node={node}
                showList={view.kind !== "list"}
                reason={plan?.reasons[todo.id]}
                rank={view.kind === "myday" && plan ? i + 1 : undefined}
                onOpen={() => setOpenTodo({ nodeId: node.id, todoId: todo.id })}
              />
            ))}

            {done.length > 0 && (
              <details className="pt-3" open>
                <summary className="cursor-pointer list-none rounded-lg px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                  Tamamlanan · {done.length}
                </summary>
                <div className="mt-2 space-y-2">
                  {done.map(({ todo, node }) => (
                    <TaskRow
                      key={todo.id}
                      todo={todo}
                      node={node}
                      showList={view.kind !== "list"}
                      onOpen={() => setOpenTodo({ nodeId: node.id, todoId: todo.id })}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-card px-4 py-3 pr-[calc(1rem+4.5rem)] sm:pr-4">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="todos-live"
          className="sr-only"
        >
          {liveMsg}
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draftText.trim()}
            aria-label="Görev ekle"
            className="rounded-md text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <Plus className="h-5 w-5" />
          </button>
          <Input
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Görev ekle — örn. yarın 9'da spor !1 #sağlık"
            className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draftText.trim()}
            aria-label="Görev ekle"
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            Ekle
          </button>
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
      <Toaster position="top-center" />
    </main>
  );
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "text-foreground hover:bg-muted/60"
      }`}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count > 0 && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}


function TaskRow({
  todo,
  node,
  showList,
  onOpen,
  reason,
  rank,
}: {
  todo: Todo;
  node: MindNode;
  showList: boolean;
  onOpen: () => void;
  reason?: string;
  rank?: number;
}) {
  const stepCount = todo.steps?.length ?? 0;
  const stepDone = todo.steps?.filter((s) => s.done).length ?? 0;
  const overdue = todo.dueAt && todo.dueAt < Date.now() && !todo.done;
  const blocked = !todo.done && isBlocked(todo, node.todos);
  const prio = todo.priority ? PRIORITY_META[todo.priority] : null;
  const blockerCount = (todo.blockedBy ?? []).filter((id) => {
    const d = node.todos.find((t) => t.id === id);
    return d && !d.done;
  }).length;

  return (
    <motion.div
      layout
      className={`flex items-center gap-3 rounded-2xl bg-card px-3 py-3 shadow-soft ${
        blocked ? "opacity-70" : ""
      }`}
    >
      {prio && (
        <span
          aria-label={prio.label}
          title={prio.label}
          className={`h-8 w-1 shrink-0 rounded-full ${
            todo.priority === 1
              ? "bg-red-500"
              : todo.priority === 2
                ? "bg-amber-500"
                : todo.priority === 3
                  ? "bg-blue-500"
                  : "bg-muted-foreground/50"
          }`}
        />
      )}
      {rank !== undefined && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
          {rank}
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (blocked) {
            toast.message("Bu görev başka göreve bağlı, önce onu tamamla.");
            return;
          }
          mindmap.toggleTodo(node.id, todo.id);
        }}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          todo.done
            ? "border-primary bg-primary text-primary-foreground"
            : blocked
              ? "border-muted-foreground/30 bg-muted/40"
              : "border-muted-foreground/40"
        }`}
        aria-label={blocked ? "Engellenen" : "Tamamla"}
      >
        {todo.done ? (
          <Check className="h-3.5 w-3.5" />
        ) : blocked ? (
          <Lock className="h-3 w-3 text-muted-foreground" />
        ) : null}
      </button>


      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div
          className={`truncate text-sm font-medium ${
            todo.done ? "text-muted-foreground line-through" : ""
          }`}
        >
          {todo.text}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {showList && (
            <span className="flex items-center gap-1">
              <Home className="h-3 w-3" />
              {node.title}
            </span>
          )}
          {prio && (
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${prio.bg} ${prio.color}`}>
              <Flag className="h-2.5 w-2.5" />
              {prio.short}
            </span>
          )}
          {blockerCount > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              <Link2 className="h-2.5 w-2.5" />
              {blockerCount} bekliyor
            </span>
          )}
          {todo.myDay && (
            <span className="flex items-center gap-1 text-amber-600">
              <Sun className="h-3 w-3" /> Günüm
            </span>
          )}
          {todo.dueAt && (
            <span className={`flex items-center gap-1 ${overdue ? "text-destructive" : ""}`}>
              <CalendarDays className="h-3 w-3" />
              {new Date(todo.dueAt).toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "short",
              })}
              {isToday(todo.dueAt) && " · Bugün"}
            </span>
          )}
          {todo.reminderAt && (
            <span className="flex items-center gap-1">
              <Bell className="h-3 w-3" />
              {new Date(todo.reminderAt).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {stepCount > 0 && (
            <span>
              {stepDone}/{stepCount} adım
            </span>
          )}
          {todo.note && (
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
            </span>
          )}
          {todo.tags?.map((t, i) => (
            <span
              key={`${t}-${i}`}
              className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
            >
              #{t}
            </span>
          ))}
        </div>
        {reason && (
          <div className="mt-1 flex items-start gap-1 text-[11px] italic text-primary/80">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{reason}</span>
          </div>
        )}
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          mindmap.updateTodo(node.id, todo.id, { starred: !todo.starred });
        }}
        aria-label="Önemli"
        className="shrink-0 p-1"
      >
        <Star
          className={`h-4 w-4 ${
            todo.starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50"
          }`}
        />
      </button>
    </motion.div>
  );
}

function EmptyState({ viewKind }: { viewKind: View["kind"] }) {
  const msg =
    viewKind === "myday"
      ? "Günün için henüz görev yok"
      : viewKind === "starred"
        ? "Henüz önemli görev yok"
        : viewKind === "planned"
          ? "Planlanmış görev yok"
          : viewKind === "today"
            ? "Bugün için görev yok"
            : viewKind === "overdue"
              ? "Geciken görev yok — harika!"
              : viewKind === "highprio"
                ? "Yüksek öncelikli görev yok"
                : viewKind === "blocked"
                  ? "Engellenen görev yok"
                  : "Henüz görev yok";
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-card shadow-soft">
        <ListChecks className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold">{msg}</p>
      <p className="mt-1 text-xs text-muted-foreground">Aşağıdan yeni bir görev ekle.</p>
    </div>
  );
}
