import { useMemo } from "react";
import { Flame, ListChecks, Star, Tags } from "lucide-react";
import type { MindNode, Todo } from "@/lib/mindmap-store";

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function computeStreak(timestamps: number[]) {
  if (timestamps.length === 0) return 0;
  const days = new Set(timestamps.map(dayKey));
  let streak = 0;
  const cursor = new Date();
  // allow streak to count from today OR yesterday (so "completed yesterday but not today" still shows 1)
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor.getTime()))) return 0;
  }
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function TodoStats({ nodes }: { nodes: MindNode[] }) {
  const stats = useMemo(() => {
    const todos: Todo[] = nodes.flatMap((n) => n.todos);
    const done = todos.filter((t) => t.done);
    const today = done.filter(
      (t) => t.completedAt && dayKey(t.completedAt) === dayKey(Date.now()),
    ).length;
    const starred = todos.filter((t) => t.starred && !t.done).length;
    const tagSet = new Set<string>();
    todos.forEach((t) => t.tags?.forEach((tag) => tagSet.add(tag)));
    const streak = computeStreak(
      done.filter((t) => t.completedAt).map((t) => t.completedAt as number),
    );
    return {
      doneTotal: done.length,
      doneToday: today,
      starred,
      tags: tagSet.size,
      streak,
    };
  }, [nodes]);

  return (
    <div className="grid grid-cols-4 gap-2 px-4 py-3">
      <Card icon={<Flame className="h-4 w-4" />} label="Seri" value={`${stats.streak}g`} accent />
      <Card icon={<ListChecks className="h-4 w-4" />} label="Bugün" value={stats.doneToday} />
      <Card icon={<Star className="h-4 w-4" />} label="Önemli" value={stats.starred} />
      <Card icon={<Tags className="h-4 w-4" />} label="Etiket" value={stats.tags} />
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-2xl px-2 py-2.5 shadow-soft ${
        accent ? "bg-primary text-primary-foreground" : "bg-card"
      }`}
    >
      <span className={accent ? "text-primary-foreground/80" : "text-muted-foreground"}>
        {icon}
      </span>
      <span className="text-base font-bold leading-none">{value}</span>
      <span
        className={`text-[10px] ${
          accent ? "text-primary-foreground/80" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
