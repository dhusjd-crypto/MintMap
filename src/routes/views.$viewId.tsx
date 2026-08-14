import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Check, Play, TimerReset } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import {
  SMART_VIEW_REGISTRY,
  SMART_VIEW_IDS,
  type SmartViewId,
  type SmartViewResult,
} from "@/application/smart-views";
import { smartViewsApplication } from "@/application/smart-views/application";
import { useNodes } from "@/lib/mindmap-store";
import { toast } from "sonner";

export const Route = createFileRoute("/views/$viewId")({ component: SmartViewPage });

function isViewId(value: string): value is SmartViewId {
  return (SMART_VIEW_IDS as readonly string[]).includes(value);
}
function SmartViewPage() {
  const { viewId: raw } = Route.useParams();
  const viewId = isViewId(raw) ? raw : "now";
  const nodes = useNodes();
  const [view, setView] = useState<SmartViewResult>();
  const refresh = useCallback(
    () =>
      smartViewsApplication.queries
        .getView({
          viewId,
          now: Date.now(),
          timezone: "Europe/Istanbul",
          availableSlotMinutes: 30,
        })
        .then(setView)
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : "Görünüm yüklenemedi"),
        ),
    [viewId],
  );
  useEffect(() => {
    void refresh();
  }, [nodes, refresh]);
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await refresh();
      toast.success("Güncellendi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İşlem tamamlanamadı");
    }
  };
  const definition = SMART_VIEW_REGISTRY.find((value) => value.id === viewId);
  return (
    <div className="min-h-dvh bg-background pb-24">
      <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Smart Views
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{definition?.label}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {definition?.description} · {view?.count ?? 0}
            </p>
          </div>
          <Link to="/command-center" className="text-sm text-primary">
            Komuta Merkezi
          </Link>
        </header>
        <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
          {SMART_VIEW_REGISTRY.map((definition) => (
            <Link
              key={definition.id}
              to="/views/$viewId"
              params={{ viewId: definition.id }}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${definition.id === viewId ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {definition.label}
            </Link>
          ))}
        </nav>
        {view?.warnings.length ? (
          <p className="text-xs text-muted-foreground">{view.warnings[0]}</p>
        ) : null}
        {view === undefined ? (
          <section className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Görünüm hazırlanıyor.
          </section>
        ) : view.items.length ? (
          <section className="space-y-2">
            {view.items.map((item) => (
              <article
                key={item.entityId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
              >
                <div>
                  <h2 className="font-medium">{item.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.subtitle ?? item.state}
                    {item.estimatedMinutes ? ` · ${item.estimatedMinutes} dk` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${item.title} başlat`}
                    onClick={() =>
                      void run(() => smartViewsApplication.commands.start(item.entityId))
                    }
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${item.title} tamamla`}
                    onClick={() =>
                      void run(() => smartViewsApplication.commands.done(item.entityId))
                    }
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${item.title} ertele`}
                    onClick={() =>
                      void run(() => smartViewsApplication.commands.snooze(item.entityId, 30))
                    }
                  >
                    <TimerReset className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Bu görünüm için uygun kayıt yok.
          </section>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
