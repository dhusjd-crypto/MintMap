import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  clearShareDebug,
  clearShareHistory,
  listShareDebug,
  listShareHistory,
  type ShareDebugEntry,
  type ShareHistoryEntry,
} from "@/lib/share-inbox";

export const Route = createFileRoute("/share-analytics")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Paylaşım logları — MintMap" },
      { name: "description", content: "Share-inbox akışındaki tüm hata ve olay logları." },
    ],
  }),
  component: ShareAnalyticsPage,
});

function fmtTime(at: number) {
  try {
    return new Date(at).toLocaleString();
  } catch {
    return String(at);
  }
}

function statusOf(entry: ShareDebugEntry): string {
  const raw = entry.result?.status;
  if (typeof raw === "string") return raw;
  if (entry.result?.error) return "error";
  return "info";
}

function isErrorStatus(s: string) {
  return s.startsWith("error") || s === "no-files" || s === "fail" || s === "unsupported";
}

function ShareAnalyticsPage() {
  const navigate = useNavigate();
  const [debug, setDebug] = useState<ShareDebugEntry[]>([]);
  const [history, setHistory] = useState<ShareHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "errors">("errors");

  const refresh = async () => {
    setLoading(true);
    const [d, h] = await Promise.all([listShareDebug(), listShareHistory()]);
    setDebug(d);
    setHistory(h);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const stats = useMemo(() => {
    const total = debug.length;
    let errors = 0;
    const bySource = new Map<string, number>();
    const byStatus = new Map<string, number>();
    let last24h = 0;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const e of debug) {
      const s = statusOf(e);
      if (isErrorStatus(s)) errors++;
      bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
      byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
      if (e.at >= cutoff) last24h++;
    }
    return {
      total,
      errors,
      last24h,
      successRate: total === 0 ? 100 : Math.round(((total - errors) / total) * 100),
      bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]),
      byStatus: [...byStatus.entries()].sort((a, b) => b[1] - a[1]),
      sharesTotal: history.length,
      filesTotal: history.reduce((acc, h) => acc + h.count, 0),
    };
  }, [debug, history]);

  const visibleDebug = useMemo(() => {
    if (filter === "all") return debug;
    return debug.filter((e) => isErrorStatus(statusOf(e)));
  }, [debug, filter]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => void navigate({ to: "/share-inbox" })}
          className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-card"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Geri
        </button>
        <div className="text-sm font-semibold">Paylaşım logları</div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Yenile
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="Toplam olay" value={stats.total} />
          <Card label="Hatalı olay" value={stats.errors} tone={stats.errors > 0 ? "error" : "default"} />
          <Card label="Son 24s" value={stats.last24h} />
          <Card label="Başarı oranı" value={`%${stats.successRate}`} tone={stats.successRate >= 90 ? "success" : "warn"} />
          <Card label="Toplam paylaşım" value={stats.sharesTotal} />
          <Card label="Eklenen dosya" value={stats.filesTotal} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card/60 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kaynaklara göre
            </h3>
            {stats.bySource.length === 0 ? (
              <p className="text-xs text-muted-foreground">Henüz log yok.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {stats.bySource.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="truncate">{k}</span>
                    <span className="font-mono">{v}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Duruma göre
            </h3>
            {stats.byStatus.length === 0 ? (
              <p className="text-xs text-muted-foreground">Henüz log yok.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {stats.byStatus.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className={`truncate ${isErrorStatus(k) ? "text-destructive" : ""}`}>{k}</span>
                    <span className="font-mono">{v}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Olay akışı ({visibleDebug.length})
            </h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setFilter("errors")}
                className={`rounded-md border px-2 py-1 text-[11px] ${
                  filter === "errors" ? "border-destructive bg-destructive/10 text-destructive" : "border-border/60"
                }`}
              >
                Sadece hatalar
              </button>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-md border px-2 py-1 text-[11px] ${
                  filter === "all" ? "border-primary bg-primary/10 text-primary" : "border-border/60"
                }`}
              >
                Tümü
              </button>
            </div>
          </div>
          <ul className="space-y-2">
            {visibleDebug.length === 0 && (
              <li className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                Bu filtreyle log yok. 🎉
              </li>
            )}
            {visibleDebug.map((e) => {
              const s = statusOf(e);
              const err = isErrorStatus(s);
              return (
                <li
                  key={e.id}
                  className={`rounded-xl border p-2 text-[11px] ${
                    err ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono">{fmtTime(e.at)}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5">{e.source}</span>
                    <span className={`rounded px-1.5 py-0.5 ${err ? "bg-destructive/20 text-destructive" : "bg-muted"}`}>
                      {s}
                    </span>
                  </div>
                  {Boolean(e.result?.error) && (
                    <p className="mt-1 break-all text-destructive">{String(e.result?.error)}</p>
                  )}

                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground">JSON</summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[10px]">
                      {JSON.stringify(e, null, 2)}
                    </pre>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify({ stats, debug, history }, null, 2));
                toast.success("Tüm log raporu kopyalandı");
              } catch {
                toast.error("Kopyalanamadı");
              }
            }}
          >
            Raporu kopyala
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await clearShareDebug();
              setDebug([]);
              toast.success("Hata logları temizlendi");
            }}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Hata loglarını sil
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await clearShareHistory();
              setHistory([]);
              toast.success("Paylaşım geçmişi temizlendi");
            }}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Geçmişi sil
          </Button>
          <Link to="/share-inbox" className="rounded-md border border-border/60 px-3 py-1.5 text-xs hover:bg-card">
            Paylaşım kutusu
          </Link>
        </section>
      </main>
    </div>
  );
}

function Card({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "error" | "warn" | "success";
}) {
  const tones: Record<string, string> = {
    default: "border-border/60 bg-card/60",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
