import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronLeft, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { reviewApplication } from "@/application/review";
import { createReviewQueries } from "@/application/queries/review-queries";
import { useNodes } from "@/lib/mindmap-store";
import type { RoutineType } from "@/domain/review";
import { localDate } from "@/engines/trigger/scoring";
import { toast } from "sonner";

export const Route = createFileRoute("/review/$reviewType")({
  head: () => ({ meta: [{ title: "Gözden geçirme — MintMap" }] }),
  component: ReviewPage,
});

const labels: Record<RoutineType, string> = {
  MORNING_PLANNING: "Sabah planı",
  MIDDAY_RECALIBRATION: "Gün ortası",
  EVENING_SHUTDOWN: "Günü kapat",
  TOMORROW_PLANNING: "Yarın planı",
  WEEKLY_REVIEW: "Haftalık gözden geçirme",
  WEEK_AHEAD_PLANNING: "Hafta öncesi",
  REENTRY_RESET: "Yeniden başlama",
};

function ReviewPage() {
  const { reviewType } = Route.useParams();
  const type = (
    reviewType.toUpperCase() in labels ? reviewType.toUpperCase() : "MORNING_PLANNING"
  ) as RoutineType;
  const nodes = useNodes();
  const now = Date.now();
  const date = localDate(now, "Europe/Istanbul");
  const queries = useMemo(
    () =>
      createReviewQueries({
        listTasks: () =>
          nodes.flatMap((node) =>
            node.todos.map((task) => ({
              task,
              nodeId: node.id,
              nodeTitle: node.title,
              workspaceId: "",
              workspaceName: "",
            })),
          ),
      }),
    [nodes],
  );
  const summary = queries.getSummary(type, now, "Europe/Istanbul");
  const [completed, setCompleted] = useState(false);
  const finish = async () => {
    await reviewApplication.commands.complete(type, date);
    setCompleted(true);
    toast.success("Gözden geçirme kaydedildi");
  };
  const rollover = async (taskId: string) => {
    const tomorrow = localDate(now + 86_400_000, "Europe/Istanbul");
    await reviewApplication.commands.recordRollover(taskId, date, "MOVE_TO_TOMORROW", tomorrow);
    toast.success("Görev yarına planlandı");
  };
  return (
    <div className="min-h-dvh bg-background pb-24 text-foreground">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex items-center gap-3">
          <Link to="/command-center" aria-label="Komuta merkezine dön">
            <ChevronLeft />
          </Link>
          <div>
            <p className="text-xs uppercase tracking-wider text-primary">MintMap review</p>
            <h1 className="text-2xl font-semibold">{labels[type]}</h1>
          </div>
        </header>
        <section className="rounded-2xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">{summary.localDate}</p>
          <p className="mt-2 text-sm">
            Sadece karar gerektiren birkaç maddeyi ele al. Görevler otomatik taşınmaz.
          </p>
          {summary.warnings.map((warning) => (
            <p key={warning} className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              {warning}
            </p>
          ))}
        </section>
        {summary.capacity && (
          <section className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Kalan", summary.capacity.remainingMinutes],
              ["Planlı", summary.capacity.plannedTaskMinutes],
              ["Aşım", summary.capacity.overcommitMinutes],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold">{value} dk</p>
              </div>
            ))}
          </section>
        )}
        <ReviewList
          title="Öncelikli"
          tasks={summary.primaryItems}
          onRollover={
            type === "MORNING_PLANNING" || type === "EVENING_SHUTDOWN" ? rollover : undefined
          }
        />
        <ReviewList title="Kontrol edilecekler" tasks={summary.secondaryItems} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={finish} disabled={completed}>
            <Check /> {completed ? "Tamamlandı" : "Gözden geçirmeyi tamamla"}
          </Button>
          <Link
            to="/command-center"
            className="inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm"
          >
            <RotateCcw /> Sonra dön
          </Link>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function ReviewList({
  title,
  tasks,
  onRollover,
}: {
  title: string;
  tasks: readonly { id: string; title: string; estimatedMinutes?: number; dueAt?: number }[];
  onRollover?: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-2">
        {tasks.length ? (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3"
            >
              <div>
                <p className="text-sm font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {task.estimatedMinutes ?? "?"} dk {task.dueAt ? "· son tarih var" : ""}
                </p>
              </div>
              {onRollover && (
                <Button size="sm" variant="outline" onClick={() => onRollover(task.id)}>
                  Yarına al
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">Şu anda karar gerektiren kayıt yok.</p>
        )}
      </div>
    </section>
  );
}
