import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Link2, Search, Star, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNodes, useWorkspaces, mindmap } from "@/lib/mindmap-store";
import {
  clearShareHistory,
  getShareDefaults,
  listShareHistory,
  setShareDefaults,
  type ShareDefaults,
  type ShareHistoryEntry,
} from "@/lib/share-inbox";

export const Route = createFileRoute("/share-settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Paylaşım ayarları — MintMap" },
      {
        name: "description",
        content: "Varsayılan paylaşım hedefini ve paylaşım geçmişini yönet.",
      },
    ],
  }),
  component: ShareSettingsPage,
});

function fmt(ts: number) {
  return new Date(ts).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ShareSettingsPage() {
  const navigate = useNavigate();
  const { workspaces, currentId } = useWorkspaces();
  const nodes = useNodes();
  const [defaults, setDefaultsState] = useState<ShareDefaults | null>(null);
  const [history, setHistory] = useState<ShareHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editWs, setEditWs] = useState<string>("");
  const [editNode, setEditNode] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getShareDefaults(), listShareHistory()]).then(([d, h]) => {
      if (cancelled) return;
      setDefaultsState(d);
      setHistory(h);
      setEditWs(d?.ws ?? currentId);
      setEditNode(d?.node ?? "");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  const editWsObj = workspaces.find((w) => w.id === editWs);
  // Nodes filtered to selected workspace
  const editNodes =
    editWsObj?.id === currentId ? nodes : (editWsObj?.nodes ?? []);

  const defaultWs = defaults && workspaces.find((w) => w.id === defaults.ws);
  const defaultNodeTitle = defaults
    ? defaultWs?.nodes.find((n) => n.id === defaults.node)?.title ?? "—"
    : null;

  const saveDefault = async () => {
    if (!editWs || !editNode) return;
    const next: ShareDefaults = { ws: editWs, node: editNode };
    await setShareDefaults(next);
    setDefaultsState(next);
    toast.success("Varsayılan paylaşım hedefi güncellendi");
  };

  const clearDefault = async () => {
    await setShareDefaults(null);
    setDefaultsState(null);
    setEditNode("");
    toast.message("Varsayılan hedef kaldırıldı");
  };

  const onClearHistory = async () => {
    await clearShareHistory();
    setHistory([]);
    toast.message("Geçmiş temizlendi");
  };

  const openDeepLink = (entry: ShareHistoryEntry) => {
    void navigate({
      to: "/share-inbox",
      search: { ws: entry.ws, node: entry.node },
    });
  };

  const copyDeepLink = async (entry: ShareHistoryEntry) => {
    const url = `${window.location.origin}/share-inbox?ws=${encodeURIComponent(entry.ws)}&node=${encodeURIComponent(entry.node)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Deep link kopyalandı");
    } catch {
      toast.message(url);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur">
        <Link
          to="/share-inbox"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-card"
          aria-label="Geri"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Paylaşım ayarları</h1>
          <p className="text-xs text-muted-foreground">
            Varsayılan hedef · Deep link geçmişi
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-4 pb-16">
        <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Star className="h-4 w-4 text-yellow-500" fill="currentColor" />
              Varsayılan paylaşım hedefi
            </h2>
            {defaults && (
              <Button variant="ghost" size="sm" onClick={() => void clearDefault()}>
                Kaldır
              </Button>
            )}
          </div>
          {loading ? (
            <p className="text-xs text-muted-foreground">Yükleniyor…</p>
          ) : (
            <>
              {defaults ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  Şu an: <span className="font-medium text-foreground">{defaultWs?.name ?? "—"}</span>
                  {" › "}
                  <span className="font-medium text-foreground">{defaultNodeTitle}</span>
                </p>
              ) : (
                <p className="mb-3 text-xs text-muted-foreground">
                  Varsayılan hedef ayarlı değil. Paylaş menüsünden gelen dosyalar
                  hedef seçim ekranında bekler.
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                    Workspace
                  </label>
                  <Select
                    value={editWs}
                    onValueChange={(v) => {
                      setEditWs(v);
                      setEditNode("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.emoji ? `${w.emoji} ` : ""}
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                    Düğüm
                  </label>
                  <Select value={editNode} onValueChange={setEditNode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Düğüm seç…" />
                    </SelectTrigger>
                    <SelectContent>
                      {editNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="mt-3 w-full"
                disabled={!editWs || !editNode}
                onClick={() => void saveDefault()}
              >
                Varsayılan olarak kaydet
              </Button>
            </>
          )}
        </section>

        <HistorySection
          loading={loading}
          history={history}
          workspaces={workspaces}
          currentId={currentId}
          onClear={() => void onClearHistory()}
          onCopy={copyDeepLink}
          onOpen={(h) => {
            if (h.ws !== currentId) mindmap.workspace.switch(h.ws);
            openDeepLink(h);
          }}
        />
      </main>
    </div>
  );
}

const PAGE_SIZE = 20;

function HistorySection({
  loading,
  history,
  workspaces,
  currentId,
  onClear,
  onCopy,
  onOpen,
}: {
  loading: boolean;
  history: ShareHistoryEntry[];
  workspaces: ReturnType<typeof useWorkspaces>["workspaces"];
  currentId: string;
  onClear: () => void;
  onCopy: (h: ShareHistoryEntry) => void;
  onOpen: (h: ShareHistoryEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [wsFilter, setWsFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "count">("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    const result = history.filter((h) => {
      if (wsFilter !== "all" && h.ws !== wsFilter) return false;
      if (from !== null && h.at < from) return false;
      if (to !== null && h.at > to) return false;
      if (q) {
        const hay = [
          h.nodeTitle,
          h.wsName,
          ...h.files.map((f) => f.name),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...result];
    if (sortBy === "newest") sorted.sort((a, b) => b.at - a.at);
    else if (sortBy === "oldest") sorted.sort((a, b) => a.at - b.at);
    else if (sortBy === "count")
      sorted.sort((a, b) => b.count - a.count || b.at - a.at);
    return sorted;
  }, [history, query, wsFilter, fromDate, toDate, sortBy]);

  // Reset paging when filters change.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, wsFilter, fromDate, toDate, sortBy, history.length]);


  // Infinite scroll: bump visible count when sentinel intersects.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (visible >= filtered.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length, visible]);

  const shown = filtered.slice(0, visible);
  const hasFilters =
    query.trim() !== "" || wsFilter !== "all" || fromDate !== "" || toDate !== "";

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Deep link geçmişi</h2>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Temizle
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-3 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Düğüm, dosya adı veya workspace ara…"
            className="pl-7"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Select value={wsFilter} onValueChange={setWsFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Workspace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm workspaceler</SelectItem>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.emoji ? `${w.emoji} ` : ""}
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="Başlangıç tarihi"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="Bitiş tarihi"
          />
        </div>
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as "newest" | "oldest" | "count")}
        >
          <SelectTrigger aria-label="Sıralama">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">En yeniler</SelectItem>
            <SelectItem value="oldest">En eskiler</SelectItem>
            <SelectItem value="count">Dosya sayısı (çoktan aza)</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {filtered.length} / {history.length} kayıt
            </span>
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => {
                setQuery("");
                setWsFilter("all");
                setFromDate("");
                setToDate("");
              }}

            >
              Filtreleri temizle
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Yükleniyor…</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Henüz paylaşım kaydı yok. Paylaş menüsünden bir görsel
          gönderdiğinde burada listelenir.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">Filtreyle eşleşen kayıt yok.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {shown.map((h) => {
              const stillExists = workspaces
                .find((w) => w.id === h.ws)
                ?.nodes.some((n) => n.id === h.node);
              return (
                <li
                  key={h.id}
                  className="rounded-xl border border-border/60 bg-background/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {h.nodeTitle}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({h.wsName})
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {fmt(h.at)} ·{" "}
                        {h.count === 1 ? "1 dosya" : `${h.count} dosya`}
                        {h.viaDeepLink ? " · deep link" : " · manuel seçim"}
                        {!stillExists && " · düğüm silinmiş"}
                      </p>
                      {h.files.length > 0 && (
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {h.files.map((f) => f.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label="Deep link kopyala"
                        onClick={() => onCopy(h)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                      {stillExists && (
                        <Button variant="outline" size="sm" onClick={() => onOpen(h)}>
                          Aç
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {visible < filtered.length ? (
            <div
              ref={sentinelRef}
              className="mt-3 flex items-center justify-center py-3 text-[11px] text-muted-foreground"
            >
              Daha fazla yükleniyor… ({visible}/{filtered.length})
            </div>
          ) : filtered.length > PAGE_SIZE ? (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Tüm sonuçlar gösterildi ({filtered.length})
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
