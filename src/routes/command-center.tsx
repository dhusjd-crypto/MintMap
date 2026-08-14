import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Clock3, Crosshair, Play, Sparkles } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { useNodes } from "@/lib/mindmap-store";
import { createExecutionExperienceQueries } from "@/application/queries/execution-experience-queries";
import { executionExperience } from "@/application/execution-experience";
import { toast } from "sonner";

export const Route = createFileRoute("/command-center")({
  head: () => ({ meta: [{ title: "Komuta Merkezi — MintMap" }] }),
  component: CommandCenterPage,
});

function formatMinutes(value?: number) {
  if (value === undefined) return "Süre tahmini yok";
  return value < 60
    ? `${value} dk`
    : `${Math.floor(value / 60)} sa ${value % 60 ? `${value % 60} dk` : ""}`.trim();
}

function CommandCenterPage() {
  const nodes = useNodes();
  const [now, setNow] = useState(() => Date.now());
  const queries = useMemo(
    () =>
      createExecutionExperienceQueries({
        listTasks: () =>
          nodes.flatMap((node) =>
            node.todos.map((task) => ({
              task,
              workspaceId: "",
              workspaceName: "",
              nodeId: node.id,
              nodeTitle: node.title,
            })),
          ),
      }),
    [nodes],
  );
  const view = useMemo(
    () =>
      queries.getExecutionNowView({ now, timezone: "Europe/Istanbul", availableSlotMinutes: 30 }),
    [queries, now],
  );
  const run = (action: () => unknown) => {
    try {
      action();
      setNow(Date.now());
      toast.success("Güncellendi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İşlem tamamlanamadı");
    }
  };
  const primary = view.primary;
  return (
    <div className="min-h-dvh bg-background pb-24 text-foreground">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              MintMap
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Komuta Merkezi</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Şimdi ne yapacağını tek bakışta gör.
            </p>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Mind Map’e dön
          </Link>
        </header>

        <section
          aria-labelledby="now-heading"
          className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Crosshair className="h-4 w-4" />
            <span id="now-heading">Şimdi</span>
          </div>
          {primary ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{primary.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {primary.projectTitle} · {formatMinutes(primary.estimatedMinutes)}
                  </p>
                </div>
                <span className="rounded-full bg-background px-3 py-1 text-xs font-medium">
                  Skor {primary.triggerScore}
                </span>
              </div>
              {primary.reasonSummaries.length > 0 && (
                <div className="rounded-xl bg-background/80 p-3 text-sm">
                  <span className="font-medium">Neden bu görev?</span>
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">
                    {primary.reasonSummaries.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => run(() => executionExperience.commands.start(primary.taskId))}
                >
                  <Play />
                  Başlat
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => run(() => executionExperience.commands.done(primary.taskId))}
                >
                  <Check />
                  Tamamla
                </Button>
                <Button
                  variant="outline"
                  onClick={() => run(() => executionExperience.commands.snooze(primary.taskId, 30))}
                >
                  <Clock3 />
                  30 dk ertele
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => run(() => executionExperience.commands.cannotDoToday())}
                >
                  Bugün yapamam
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const waitingFor = window.prompt("Neyi bekliyorsun?");
                    if (waitingFor?.trim())
                      run(() =>
                        executionExperience.commands.moveToWaiting(primary.taskId, waitingFor),
                      );
                  }}
                >
                  Beklemeye al
                </Button>
                <Link
                  to="/focus/$taskId"
                  params={{ taskId: primary.taskId }}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
                >
                  <Crosshair className="h-4 w-4" />
                  Odaklan
                </Link>
                <Link
                  to="/todos"
                  className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent"
                >
                  <ArrowRight className="h-4 w-4" />
                  Detaylar
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-background/80 p-4 text-sm text-muted-foreground">
              {view.emptyReason === "NO_TASKS"
                ? "Henüz görev yok."
                : "Şu anda uygun bir görev bulunamadı. Bekleyen veya bloklu görevlerini gözden geçirebilirsin."}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Sonraki iki seçenek</h2>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-3 space-y-2">
              {view.alternatives.length ? (
                view.alternatives.map((task) => (
                  <div
                    key={task.taskId}
                    className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMinutes(task.estimatedMinutes)} · Skor {task.triggerScore}
                      </p>
                    </div>
                    <Link
                      to="/focus/$taskId"
                      params={{ taskId: task.taskId }}
                      className="rounded-md p-2 text-primary hover:bg-primary/10"
                      aria-label={`${task.title} için odak aç`}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                ))
              ) : (
                <p className="py-4 text-sm text-muted-foreground">Alternatif bulunamadı.</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <h2 className="font-semibold">Bugün</h2>
            {view.capacity ? (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metric label="Kalan" value={formatMinutes(view.capacity.remainingMinutes)} />
                <Metric label="Planlı" value={formatMinutes(view.capacity.plannedTaskMinutes)} />
                <Metric label="Aşım" value={formatMinutes(view.capacity.overcommitMinutes)} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Bugün için planlama kapasitesi henüz tanımlı değil.
              </p>
            )}
          </div>
        </section>

        {view.signals.length > 0 && (
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="font-semibold">Önemli sinyaller</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {view.signals.map((signal) => (
                <div key={signal.id} className="rounded-xl bg-muted/50 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    {signal.title}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{signal.severity}</p>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">Bugünün ilk üçü</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {view.top3.length ? (
              view.top3.map((task) => (
                <div key={task.taskId} className="rounded-xl bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMinutes(task.estimatedMinutes)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Bugün için seçilmiş görev yok.</p>
            )}
          </div>
        </section>
        {view.quickWins.length > 0 && (
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="font-semibold">Hızlı kazanımlar</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {view.quickWins.map((task) => (
                <Link
                  key={task.taskId}
                  to="/focus/$taskId"
                  params={{ taskId: task.taskId }}
                  className="rounded-xl bg-muted/50 p-3 text-sm hover:bg-primary/10"
                >
                  <p className="font-medium">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMinutes(task.estimatedMinutes)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-semibold">Günün ritmi</h2><p className="text-xs text-muted-foreground">Kısa gözden geçirmeler, ayrı ve sakin akışlarda.</p></div>
            <Link to="/review/$reviewType" params={{ reviewType: "MORNING_PLANNING" }} className="text-sm text-primary">Sabah planı</Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {(["MIDDAY_RECALIBRATION", "EVENING_SHUTDOWN", "TOMORROW_PLANNING", "WEEKLY_REVIEW", "REENTRY_RESET"] as const).map((type) => <Link key={type} to="/review/$reviewType" params={{ reviewType: type }} className="rounded-full bg-muted px-3 py-1.5 hover:bg-primary/10">{type === "MIDDAY_RECALIBRATION" ? "Gün ortası" : type === "EVENING_SHUTDOWN" ? "Günü kapat" : type === "TOMORROW_PLANNING" ? "Yarın" : type === "WEEKLY_REVIEW" ? "Hafta" : "Yeniden başla"}</Link>)}
          </div>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
