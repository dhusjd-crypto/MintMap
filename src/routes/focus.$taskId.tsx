import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Clock3, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { focusApplication } from "@/application/focus";
import type { FocusMode } from "@/domain/focus";
import { taskApplication } from "@/application/task-application";
import { systemClock } from "@/lib/architecture/clock";
import { toast } from "sonner";

export const Route = createFileRoute("/focus/$taskId")({
  head: () => ({ meta: [{ title: "Odak — MintMap" }] }),
  component: FocusPage,
});

function formatElapsed(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor(ms / 1_000) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function FocusPage() {
  const { taskId } = Route.useParams();
  const record = taskApplication.repositories.tasks.get(taskId);
  const [session, setSession] = useState<Awaited<ReturnType<typeof focusApplication.getActive>>>();
  const [otherSession, setOtherSession] = useState<string | undefined>();
  const [mode, setMode] = useState<FocusMode>("FLOW");
  const [now, setNow] = useState(() => systemClock.nowMs());
  const task = record?.task;
  useEffect(() => {
    let cancelled = false;
    focusApplication.recover().then((value) => {
      if (!cancelled) {
        if (value?.taskId === taskId) setSession(value);
        else if (value) setOtherSession(value.taskId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);
  useEffect(() => {
    if (session?.status !== "ACTIVE") return;
    const timer = window.setInterval(() => setNow(systemClock.nowMs()), 1_000);
    return () => window.clearInterval(timer);
  }, [session?.status]);
  const elapsed = useMemo(
    () =>
      session
        ? (session.status === "ACTIVE" ? now - session.lastResumedAt : 0) +
          session.accumulatedActiveMs
        : 0,
    [session, now],
  );
  const remaining =
    session?.plannedMinutes === undefined
      ? undefined
      : Math.max(0, session.plannedMinutes - Math.floor(elapsed / 60_000));
  const act = async (
    operation: () => Promise<Awaited<ReturnType<typeof focusApplication.getActive>>>,
  ) => {
    try {
      setSession(await operation());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Odak işlemi tamamlanamadı");
    }
  };
  if (!task)
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="text-center">
          <p className="font-semibold">Görev bulunamadı.</p>
          <Link to="/command-center" className="mt-3 inline-block text-sm text-primary">
            Komuta merkezine dön
          </Link>
        </div>
      </div>
    );
  return (
    <div className="min-h-dvh bg-background pb-24 text-foreground">
      <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-xl flex-col justify-center px-5 py-10">
        <Link
          to="/command-center"
          className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Komuta merkezi
        </Link>
        <div className="rounded-3xl border bg-card p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Odak modu
          </p>
          <h1 className="mt-4 text-2xl font-semibold">{task.text}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session?.mode ?? "FLOW"} · Görev tamamlanınca ayrıca işaretlenir
          </p>
          <div className="my-10 text-6xl font-semibold tabular-nums tracking-tight">
            {session
              ? session.mode === "COUNTDOWN" && remaining !== undefined
                ? `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`
                : formatElapsed(elapsed)
              : "00:00"}
          </div>
          {session?.mode === "COUNTDOWN" && remaining === 0 && (
            <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Süre tamamlandı. Görevin bitti mi?
            </p>
          )}
          {!session && (
            <div className="mb-4 flex flex-wrap justify-center gap-2" aria-label="Odak modu seç">
              {(["FLOW", "COUNTDOWN", "POMODORO"] as const).map((candidate) => (
                <Button
                  key={candidate}
                  type="button"
                  size="sm"
                  variant={mode === candidate ? "default" : "outline"}
                  onClick={() => setMode(candidate)}
                >
                  {candidate === "FLOW"
                    ? "Akış"
                    : candidate === "COUNTDOWN"
                      ? "Geri sayım"
                      : "Pomodoro"}
                </Button>
              ))}
            </div>
          )}
          {otherSession && !session && (
            <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Başka bir görevde açık odak oturumu var. Önce onu tamamla veya kapat.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {!session ? (
              <Button
                disabled={Boolean(otherSession)}
                onClick={() =>
                  act(() =>
                    focusApplication.start(
                      taskId,
                      mode,
                      task.estimateMin ?? (mode === "POMODORO" ? 25 : undefined),
                    ),
                  )
                }
              >
                <Play />
                Odaklanmaya başla
              </Button>
            ) : session.status === "ACTIVE" ? (
              <Button variant="secondary" onClick={() => act(() => focusApplication.pause())}>
                <Pause />
                Duraklat
              </Button>
            ) : (
              <Button onClick={() => act(() => focusApplication.resume())}>
                <Play />
                Devam et
              </Button>
            )}{" "}
            {session && (
              <>
                <Button variant="outline" onClick={() => act(() => focusApplication.complete())}>
                  <Check />
                  Oturumu bitir
                </Button>
                <Button variant="outline" onClick={() => act(() => focusApplication.cancel())}>
                  <Square />
                  Çık
                </Button>
              </>
            )}
            <Link
              to="/todos"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
            >
              <Clock3 className="h-4 w-4" />
              Görev ayrıntıları
            </Link>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
