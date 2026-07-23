import { useMemo, useState } from "react";
import { Star, Clock, Target, Plus, X } from "lucide-react";
import { useNodes } from "@/lib/mindmap-store";
import { goals, useGoals, goalProgress } from "@/lib/goal-store";

// Ana ekranın üstünde sakin bir "Bugünkü Durum" özeti. Mevcut verilerden
// hesaplanır (AI yok): kaç öncelikli görev, kaç geciken, kaç aktif hedef.
// Aktif hedeflerin ilerlemesi bağlı düğümlerin görevlerinden gelir.

export function DailyBrief() {
  const nodes = useNodes();
  const allGoals = useGoals();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const { priority, overdue } = useMemo(() => {
    const now = Date.now();
    const todos = nodes.flatMap((n) => n.todos);
    return {
      priority: todos.filter((t) => !t.done && (t.priority === 1 || t.priority === 2 || t.myDay))
        .length,
      overdue: todos.filter((t) => !t.done && t.dueAt && t.dueAt < now).length,
    };
  }, [nodes]);

  const activeGoals = allGoals.filter((g) => g.status === "active");

  const submit = () => {
    if (goals.add({ title })) {
      setTitle("");
      setAdding(false);
    }
  };

  return (
    <div className="mx-5 mb-2 rounded-2xl bg-card px-4 py-3 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Bugün</span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
        >
          <Plus className="h-3 w-3" /> Hedef
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-amber-500" /> {priority} öncelik
        </span>
        <span className={`flex items-center gap-1 ${overdue > 0 ? "text-red-500" : ""}`}>
          <Clock className="h-3.5 w-3.5" /> {overdue} geciken
        </span>
        <span className="flex items-center gap-1">
          <Target className="h-3.5 w-3.5 text-primary" /> {activeGoals.length} hedef
        </span>
      </div>

      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Yeni hedef başlığı…"
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
          <button
            onClick={submit}
            disabled={!title.trim()}
            className="rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Ekle
          </button>
        </div>
      )}

      {activeGoals.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {activeGoals.slice(0, 3).map((g) => {
            const { percent } = goalProgress(g, nodes);
            return (
              <div key={g.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-[12px]">{g.title}</span>
                <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[10px] text-muted-foreground">
                  {percent}%
                </span>
                <button
                  onClick={() => goals.remove(g.id)}
                  aria-label={`${g.title} hedefini sil`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
