import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Settings as SettingsIcon,
  Star,
  X,
} from "lucide-react";
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
  clearShared,
  clearShareDebug,
  getShareDefaults,
  listShareDebug,
  listShared,
  recordShareHistory,
  recordShareDebug,
  setShareDefaults,
  sharedToFile,
  type ShareDebugEntry,
  type SharedItem,
} from "@/lib/share-inbox";
import { enqueueFiles } from "@/lib/upload-queue";
import { pagesToFiles, renderPdf } from "@/lib/pdf-thumbs";

// TanStack's default search parser JSON.parses values, so `?request_params={}`
// arrives as an object and `?share_count=1` as a number. Coerce intelligently
// instead of naive String() (which produced "[object Object]").
const optionalSearchString = z.preprocess(
  (value) => {
    if (value == null) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  },
  z.string().max(4096).optional(),
);

const searchSchema = z.object({
  ws: optionalSearchString,
  node: optionalSearchString,
  share_status: optionalSearchString,
  share_count: optionalSearchString,
  request_url: optionalSearchString,
  request_params: optionalSearchString,
  debug_id: optionalSearchString,
});

type SearchShape = z.infer<typeof searchSchema>;

/**
 * Classify a share_status string (set by the service worker) into a
 * human-readable cause + concrete steps the user can take.
 */
function classifyShareStatus(status: string | undefined | null): {
  tone: "info" | "warn" | "error";
  title: string;
  reason: string;
  steps: string[];
} | null {
  if (!status) return null;
  if (status === "ok") return null;
  if (status === "ok-text") return null;
  if (status === "no-files") {
    return {
      tone: "warn",
      title: "Paylaşımda dosya yok",
      reason: "Paylaşım menüsünden geldin ama paylaşılan içerikte görsel/PDF bulunamadı.",
      steps: [
        "Galeri veya dosya uygulamasından önce görseli/PDF'i aç.",
        "'Paylaş' butonuna bas ve MintMap'i seç.",
        "Metin paylaşımı henüz desteklenmiyor — sadece görsel ve PDF.",
      ],
    };
  }
  if (status.startsWith("error:")) {
    const raw = status.slice(6).trim();
    return {
      tone: "error",
      title: "Paylaşım okunurken hata",
      reason: raw || "Service worker paylaşımı işleyemedi.",
      steps: [
        "Sayfayı yenileyip tekrar paylaşmayı dene.",
        "Uygulamayı kaldırıp Chrome'dan yeniden 'Ana ekrana ekle' yap.",
        "Sorun sürerse aşağıdaki tanı bilgisini kopyalayıp paylaş.",
      ],
    };
  }
  if (status === "unsupported") {
    return {
      tone: "warn",
      title: "Tarayıcı paylaşımı desteklemiyor",
      reason: "Bu tarayıcı Web Share Target API'sını desteklemiyor ya da PWA yüklü değil.",
      steps: [
        "Chrome'da uygulamayı 'Ana ekrana ekle' ile yükle.",
        "Samsung Internet yerine Chrome kullan.",
        "iOS Safari paylaşım hedefi desteklemiyor — dosyaları manuel ekle.",
      ],
    };
  }
  return {
    tone: "info",
    title: `Durum: ${status}`,
    reason: "Bilinmeyen paylaşım durumu.",
    steps: ["Sayfayı yenile.", "Sorun sürerse tanı bilgisini kopyalayıp paylaş."],
  };
}

export const Route = createFileRoute("/share-inbox")({
  ssr: false,
  validateSearch: (search): SearchShape => {
    const result = searchSchema.safeParse(search);
    if (result.success) return result.data;
    // Strip invalid params silently; record for the analytics panel.
    void recordShareDebug({
      source: "share-inbox-search-validate",
      result: { status: "error", error: result.error.message },
      client: { raw: search as Record<string, unknown> },
    });
    return {};
  },
  head: () => ({
    meta: [
      { title: "Paylaşımı düğüme ekle — MintMap" },
      {
        name: "description",
        content: "Başka uygulamalardan paylaşılan görselleri bir mindmap düğümüne ekle.",
      },
    ],
  }),
  component: ShareInboxPage,
});


function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type ItemKind = "image" | "pdf" | "other";
type ItemPreview = {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: ItemKind;
  thumbUrl: string | null; // null while PDF is rendering / for unsupported
  thumbs: string[]; // multi-page thumbnails for PDFs
  pageCount?: number;
  thumbError?: string;
};

type AssignStatus =
  | { phase: "idle" }
  | { phase: "processing"; attempt: number; index: number; total: number }
  | { phase: "retrying"; attempt: number; nextAttemptAt: number; lastError: string }
  | { phase: "done"; attempts: number }
  | { phase: "error"; message: string; attempts: number };

type RetryConfig = { maxAttempts: number; delayMs: number };
const RETRY_CONFIG_KEY = "mintmap:share:retry-config";
const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3, delayMs: 1500 };

function loadRetryConfig(): RetryConfig {
  if (typeof localStorage === "undefined") return DEFAULT_RETRY;
  try {
    const raw = localStorage.getItem(RETRY_CONFIG_KEY);
    if (!raw) return DEFAULT_RETRY;
    const p = JSON.parse(raw) as Partial<RetryConfig>;
    return {
      maxAttempts: Math.min(10, Math.max(1, Number(p.maxAttempts) || DEFAULT_RETRY.maxAttempts)),
      delayMs: Math.min(60000, Math.max(250, Number(p.delayMs) || DEFAULT_RETRY.delayMs)),
    };
  } catch {
    return DEFAULT_RETRY;
  }
}


function ShareInboxPage() {
  const { ws: wsParam, node: nodeParam, share_status, share_count, request_url, request_params, debug_id } = Route.useSearch();
  const { workspaces, currentId } = useWorkspaces();
  const nodes = useNodes();
  const navigate = useNavigate();
  const [swReady, setSwReady] = useState<boolean | null>(null);

  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugEntries, setDebugEntries] = useState<ShareDebugEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [defaults, setDefaultsState] = useState<{ ws: string; node: string } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<ItemPreview[]>([]);
  const [itemStatus, setItemStatus] = useState<Record<string, AssignStatus>>({});
  const autoRanRef = useRef(false);
  const emptyReportedRef = useRef(false);

  // Auto-select a sensible default node so the "Ekle" button is immediately
  // actionable instead of hidden behind a "select a node" hint.
  useEffect(() => {
    if (selectedNodeId || nodes.length === 0) return;
    if (nodeParam && nodes.some((n) => n.id === nodeParam)) {
      setSelectedNodeId(nodeParam);
      return;
    }
    if (defaults?.ws === currentId && nodes.some((n) => n.id === defaults.node)) {
      setSelectedNodeId(defaults.node);
      return;
    }
    const root = nodes.find((n) => n.parentId === null);
    setSelectedNodeId(root?.id ?? nodes[0].id);
  }, [selectedNodeId, nodes, nodeParam, defaults, currentId]);

  // Switch workspace if deep-link points at a different one.
  useEffect(() => {
    if (wsParam && wsParam !== currentId && workspaces.some((w) => w.id === wsParam)) {
      mindmap.workspace.switch(wsParam);
    }
  }, [wsParam, currentId, workspaces]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listShared(), getShareDefaults(), listShareDebug()])
      .then(([list, d, debug]) => {
        if (cancelled) return;
        setItems(list);
        setDefaultsState(d);
        setDebugEntries(debug);
        setPreviewId(list[0]?.id ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Paylaşım kutusu okunamadı";
        setLoadError(message);
        setLoading(false);
        void recordShareDebug({
          source: "share-inbox-client-load",
          result: { status: "error", error: message },
          client: { url: window.location.href, userAgent: navigator.userAgent },
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (emptyReportedRef.current || loading || items.length > 0) return;
    // Sadece gerçek bir hata varsa toast göster — başarılı/sessiz açılışta sus.
    const isError =
      Boolean(loadError) ||
      (share_status && share_status !== "ok" && share_status !== "ok-text");
    if (!isError) return;
    emptyReportedRef.current = true;
    toast.warning("Paylaşım kutusu boş açıldı — tanı paneli hazır", {
      description: `status=${share_status ?? "—"}, count=${share_count ?? "0"}`,
    });
  }, [items.length, loadError, loading, share_count, share_status]);
  // Check whether the service worker is actually controlling this page —
  // share_target only works once the SW is active and the PWA is installed.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      setSwReady(false);
      return;
    }
    navigator.serviceWorker.getRegistration().then((r) => {
      setSwReady(!!(r && (r.active || r.waiting)));
    });
  }, []);


  // Build previews; for PDFs render pages lazily, for images use object URLs.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const base: ItemPreview[] = items.map((it) => {
      const isImg = it.type.startsWith("image/");
      const isPdf = it.type === "application/pdf" || /\.pdf$/i.test(it.name);
      if (isImg) {
        const url = URL.createObjectURL(it.file);
        created.push(url);
        return {
          id: it.id,
          name: it.name,
          size: it.size,
          type: it.type,
          kind: "image",
          thumbUrl: url,
          thumbs: [url],
        };
      }
      return {
        id: it.id,
        name: it.name,
        size: it.size,
        type: it.type,
        kind: isPdf ? "pdf" : "other",
        thumbUrl: null,
        thumbs: [],
      };
    });
    setPreviews(base);

    // Render PDFs in the background.
    (async () => {
      for (const it of items) {
        if (cancelled) return;
        const isPdf = it.type === "application/pdf" || /\.pdf$/i.test(it.name);
        if (!isPdf) continue;
        try {
          const { pageCount, pages } = await renderPdf(it.file, { maxPages: 8 });
          if (cancelled) {
            pages.forEach((p) => URL.revokeObjectURL(p.url));
            return;
          }
          pages.forEach((p) => created.push(p.url));
          setPreviews((prev) =>
            prev.map((p) =>
              p.id === it.id
                ? {
                    ...p,
                    thumbUrl: pages[0]?.url ?? null,
                    thumbs: pages.map((x) => x.url),
                    pageCount,
                  }
                : p,
            ),
          );
        } catch (e) {
          if (cancelled) return;
          const message = e instanceof Error ? e.message : "PDF okunamadı";
          void recordShareDebug({
            source: "share-inbox-pdf-preview",
            result: { status: "error", error: message },
            client: { file: { name: it.name, type: it.type, size: it.size } },
          }).then(() => listShareDebug().then(setDebugEntries));
          setPreviews((prev) =>
            prev.map((p) =>
              p.id === it.id
                ? { ...p, thumbError: message }
                : p,
            ),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [items]);

  const activePreview = previews.find((p) => p.id === previewId) ?? previews[0] ?? null;
  const currentWs = workspaces.find((w) => w.id === currentId);

  /**
   * Convert one shared item into the image File(s) the upload queue accepts.
   * Images pass through; PDFs are rendered to per-page JPEGs.
   */
  async function itemToImageFiles(it: SharedItem, preview?: ItemPreview): Promise<File[]> {
    if (it.type.startsWith("image/")) return [sharedToFile(it)];
    const isPdf = it.type === "application/pdf" || /\.pdf$/i.test(it.name);
    if (isPdf) {
      // Reuse already-rendered preview pages when available to avoid double work.
      if (preview && preview.thumbs.length && !preview.thumbError) {
        const blobs = await Promise.all(preview.thumbs.map((u) => fetch(u).then((r) => r.blob())));
        return blobs.map(
          (b, i) =>
            new File([b], `${it.name.replace(/\.pdf$/i, "")}-page-${String(i + 1).padStart(2, "0")}.jpg`, {
              type: "image/jpeg",
            }),
        );
      }
      const { pages } = await renderPdf(it.file, { maxPages: 32 });
      try {
        return pagesToFiles(it.name, pages);
      } finally {
        pages.forEach((p) => URL.revokeObjectURL(p.url));
      }
    }
    throw new Error(`Desteklenmeyen tür: ${it.type || "bilinmiyor"}`);
  }

  const lastTargetRef = useRef<string | null>(null);
  const lastViaDeepLinkRef = useRef<boolean>(false);
  const attemptsRef = useRef<Record<string, number>>({});
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryConfig, setRetryConfigState] = useState<RetryConfig>(() => loadRetryConfig());
  const [tickNow, setTickNow] = useState(() => Date.now());

  const setRetryConfig = (next: RetryConfig) => {
    const sanitized: RetryConfig = {
      maxAttempts: Math.min(10, Math.max(1, Math.round(next.maxAttempts))),
      delayMs: Math.min(60000, Math.max(250, Math.round(next.delayMs))),
    };
    setRetryConfigState(sanitized);
    try {
      localStorage.setItem(RETRY_CONFIG_KEY, JSON.stringify(sanitized));
    } catch {
      /* noop */
    }
  };

  // Cleanup retry timer on unmount.
  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  // Tick for countdown display while any item is in `retrying` state.
  useEffect(() => {
    const hasRetrying = Object.values(itemStatus).some((s) => s.phase === "retrying");
    if (!hasRetrying) return;
    const id = setInterval(() => setTickNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [itemStatus]);

  const runAttempt = useCallback(
    async (nodeId: string, viaDeepLink: boolean) => {
      if (!items.length || busy) return;
      lastTargetRef.current = nodeId;
      lastViaDeepLinkRef.current = viaDeepLink;
      setBusy(true);
      const target = nodes.find((n) => n.id === nodeId);
      const failed: SharedItem[] = [];
      const succeededNames: Array<{ name: string; size: number; type: string }> = [];
      let totalFiles = 0;

      for (const it of items) {
        const attempt = (attemptsRef.current[it.id] ?? 0) + 1;
        attemptsRef.current[it.id] = attempt;
        const previewMeta = previews.find((p) => p.id === it.id);
        setItemStatus((s) => ({
          ...s,
          [it.id]: { phase: "processing", attempt, index: 0, total: 1 },
        }));
        try {
          // Text/URL share (Samsung Browser, Chrome web share) → append to node note.
          const isText = it.type === "text/plain" || /\.txt$/i.test(it.name);
          if (isText) {
            const body = await (it.file instanceof Blob ? it.file.text() : Promise.resolve(""));
            const trimmed = body.trim();
            if (trimmed) {
              const current = target?.note ?? "";
              const next = current ? `${current}\n\n${trimmed}` : trimmed;
              mindmap.update(nodeId, { note: next });
            }
            await clearShared([it.id]);
            succeededNames.push({ name: it.name, size: it.size, type: it.type });
            totalFiles += 1;
            setItemStatus((s) => ({ ...s, [it.id]: { phase: "done", attempts: attempt } }));
            continue;
          }
          const files = await itemToImageFiles(it, previewMeta);
          setItemStatus((s) => ({
            ...s,
            [it.id]: { phase: "processing", attempt, index: 0, total: files.length },
          }));
          await enqueueFiles(nodeId, files);
          await clearShared([it.id]);
          succeededNames.push(...files.map((f) => ({ name: f.name, size: f.size, type: f.type })));
          totalFiles += files.length;
          setItemStatus((s) => ({ ...s, [it.id]: { phase: "done", attempts: attempt } }));
        } catch (e) {
          const message = e instanceof Error ? e.message : "Eklenemedi";
          failed.push(it);
          void recordShareDebug({
            source: "share-inbox-assign",
            result: { status: "error", error: message, attempt, maxAttempts: retryConfig.maxAttempts },
            client: { nodeId, file: { name: it.name, type: it.type, size: it.size } },
          }).then(() => listShareDebug().then(setDebugEntries));
          if (attempt < retryConfig.maxAttempts) {
            setItemStatus((s) => ({
              ...s,
              [it.id]: {
                phase: "retrying",
                attempt,
                nextAttemptAt: Date.now() + retryConfig.delayMs,
                lastError: message,
              },
            }));
          } else {
            setItemStatus((s) => ({
              ...s,
              [it.id]: { phase: "error", message, attempts: attempt },
            }));
          }
        }
      }

      if (succeededNames.length) {
        await recordShareHistory({
          ws: currentId,
          wsName: currentWs?.name ?? "—",
          node: nodeId,
          nodeTitle: target?.title ?? "—",
          count: totalFiles,
          files: succeededNames,
          viaDeepLink,
        });
      }

      setItems(failed);
      setBusy(false);

      if (failed.length === 0) {
        toast.success(totalFiles === 1 ? "1 dosya kuyruğa eklendi" : `${totalFiles} dosya kuyruğa eklendi`);
        void navigate({ to: "/" });
        return;
      }

      const stillRetryable = failed.filter(
        (it) => (attemptsRef.current[it.id] ?? 0) < retryConfig.maxAttempts,
      );

      if (stillRetryable.length > 0) {
        toast.message(
          `${stillRetryable.length} dosya ${Math.round(retryConfig.delayMs / 100) / 10}s içinde tekrar denenecek`,
          { description: `Limit: ${retryConfig.maxAttempts} deneme` },
        );
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          void runAttempt(nodeId, viaDeepLink);
        }, retryConfig.delayMs);
      } else {
        toast.error(
          `${failed.length} dosya ${retryConfig.maxAttempts} denemeden sonra başarısız oldu`,
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, busy, nodes, previews, currentId, currentWs, navigate, retryConfig],
  );

  const assignTo = (nodeId: string, viaDeepLink = false) => {
    // Fresh user-initiated run — reset attempt counters for the current items.
    items.forEach((it) => {
      attemptsRef.current[it.id] = 0;
    });
    void runAttempt(nodeId, viaDeepLink);
  };

  const retryAllFailed = () => {
    const nodeId = lastTargetRef.current;
    if (!nodeId || !items.length) {
      toast.error("Önce bir düğüm seç");
      return;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    // Reset attempts so the user gets a fresh budget.
    items.forEach((it) => {
      attemptsRef.current[it.id] = 0;
    });
    void runAttempt(nodeId, lastViaDeepLinkRef.current);
  };

  // Auto-assign when deep link resolves to a real node and items are loaded.
  useEffect(() => {
    if (autoRanRef.current || loading || busy) return;
    if (!wsParam || !nodeParam) return;
    if (wsParam !== currentId) return;
    const target = nodes.find((n) => n.id === nodeParam);
    if (!target || !items.length) return;
    autoRanRef.current = true;
    assignTo(target.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, busy, wsParam, nodeParam, currentId, nodes, items]);

  const removeOne = async (id: string) => {
    await clearShared([id]);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setItemStatus((s) => {
      const { [id]: _, ...rest } = s;
      return rest;
    });
    delete attemptsRef.current[id];
    if (previewId === id) setPreviewId(null);
  };


  const discard = async () => {
    await clearShared(items.map((i) => i.id));
    setItems([]);
    toast.message("Paylaşımlar atıldı");
    void navigate({ to: "/" });
  };

  const deepLinkFor = (nodeId: string) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/share-inbox?ws=${encodeURIComponent(currentId)}&node=${encodeURIComponent(nodeId)}`;
  };

  const copyDeepLink = async (nodeId: string) => {
    const url = deepLinkFor(nodeId);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Deep link kopyalandı");
    } catch {
      toast.message(url);
    }
  };

  const copyDebugReport = async () => {
    const report = buildDebugReport();
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Tanı bilgisi kopyalandı");
    } catch {
      toast.message(text.slice(0, 1800));
    }
  };

  const clearDebugReport = async () => {
    await clearShareDebug();
    setDebugEntries([]);
    toast.success("Tanı kayıtları temizlendi");
  };

  const toggleDefault = async (nodeId: string) => {
    const isDefault = defaults?.ws === currentId && defaults?.node === nodeId;
    const next = isDefault ? null : { ws: currentId, node: nodeId };
    await setShareDefaults(next);
    setDefaultsState(next);
    toast.success(
      isDefault
        ? "Varsayılan hedef kaldırıldı"
        : "Bundan sonraki paylaşımlar bu düğüme gelecek",
    );
  };

  function StatusBadge({ s }: { s: AssignStatus | undefined }) {
    if (!s || s.phase === "idle") return null;
    if (s.phase === "processing")
      return (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Deneme {s.attempt}/{retryConfig.maxAttempts}
        </span>
      );
    if (s.phase === "retrying") {
      const remaining = Math.max(0, Math.ceil((s.nextAttemptAt - tickNow) / 1000));
      return (
        <span
          className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"
          title={s.lastError}
        >
          <RefreshCw className="h-3 w-3 animate-spin" /> {remaining}s · {s.attempt + 1}/{retryConfig.maxAttempts}
        </span>
      );
    }
    if (s.phase === "done")
      return (
        <span className="flex items-center gap-1 text-[10px] text-emerald-500">
          <CheckCircle2 className="h-3 w-3" /> Eklendi{s.attempts > 1 ? ` (${s.attempts}. deneme)` : ""}
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-[10px] text-destructive" title={s.message}>
        <AlertCircle className="h-3 w-3" /> {s.attempts} deneme · {s.message}
      </span>
    );
  }


  function parsedRequestParams() {
    if (!request_params) return null;
    try {
      return JSON.parse(request_params) as Record<string, string>;
    } catch {
      return request_params;
    }
  }

  function buildDebugReport() {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const currentParams = typeof window !== "undefined"
      ? Object.fromEntries(new URLSearchParams(window.location.search).entries())
      : {};
    return {
      capturedAt: new Date().toISOString(),
      currentUrl,
      currentParams,
      shareTargetRedirect: {
        share_status: share_status ?? null,
        share_count: share_count ?? null,
        request_url: request_url ?? null,
        request_params: parsedRequestParams(),
        debug_id: debug_id ?? null,
      },
      runtime: {
        swReady,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        standalone: typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches,
      },
      inbox: {
        loading,
        count: items.length,
        files: items.map((item) => ({ name: item.name, type: item.type, size: item.size, meta: item.meta })),
      },
      errors: {
        loadError,
        shareStatus: share_status?.startsWith("error:") || share_status === "no-files" ? share_status : null,
        previews: previews.filter((p) => p.thumbError).map((p) => ({ name: p.name, error: p.thumbError })),
        assign: Object.entries(itemStatus)
          .filter(([, status]) => status.phase === "error")
          .map(([id, status]) => ({ id, error: status.phase === "error" ? status.message : "" })),
        serviceWorker: debugEntries
          .filter((entry) => {
            const status = String(entry.result?.status ?? "");
            return status.startsWith("error:") || status === "no-files" || Boolean(entry.result?.error);
          })
          .slice(0, 10),
      },
      recentDebugEntries: debugEntries.slice(0, 10),
    };
  }

  const debugReport = buildDebugReport();

  // Stricter param validation — surface issues so the user can recover.
  const paramIssues = useMemo(() => {
    const issues: string[] = [];
    // request_url is the SW-supplied path (e.g. "/share-inbox") — accept relative paths too.
    if (request_url && !/^(https?:\/\/|\/)/i.test(request_url)) {
      issues.push("request_url geçerli bir yol değil");
    }
    if (share_count && !/^\d+$/.test(share_count)) {
      issues.push("share_count sayısal değil");
    }
    if (debug_id && !/^[a-z0-9-]{3,}$/i.test(debug_id)) {
      issues.push("debug_id beklenen formatta değil");
    }
    if (wsParam && !workspaces.some((w) => w.id === wsParam)) {
      issues.push(`ws=${wsParam} workspace bulunamadı`);
    }
    if (nodeParam && nodes.length > 0 && !nodes.some((n) => n.id === nodeParam)) {
      issues.push(`node=${nodeParam} bu workspace'te yok`);
    }
    return issues;
  }, [request_url, share_count, debug_id, wsParam, nodeParam, workspaces, nodes]);

  const shareClass = classifyShareStatus(share_status);
  const failedItems = items.filter((it) => itemStatus[it.id]?.phase === "error");
  const canRetry = failedItems.length > 0 && Boolean(lastTargetRef.current);

  // Sadece gerçek bir hata varsa tanı panelini göster. Başarılı paylaşımlar
  // ("ok", "ok-text") ya da boş açılış için bu paneli gizliyoruz.
  const hasShareError =
    Boolean(loadError) ||
    Boolean(shareClass) ||
    failedItems.length > 0 ||
    paramIssues.length > 0;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-lg font-semibold">Paylaşımı bir düğüme ekle</h1>
          <p className="text-xs text-muted-foreground">Önizle, workspace ve düğüm seç</p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/share-analytics"
            className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-card"
          >
            Loglar
          </Link>
          <Link
            to="/share-settings"
            className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-card"
          >
            <SettingsIcon className="h-3.5 w-3.5" /> Ayarlar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 pb-32">
        {hasShareError && (
          <details
            open={Boolean(loadError || shareClass)}
            className="mb-3 rounded-xl border border-border/60 bg-card/70 p-3 text-xs"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
              <span>Android paylaşım tanı paneli</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                status={share_status ?? "—"} · count={share_count ?? "0"}
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-muted/60 p-2">
                  <div className="text-muted-foreground">share_status</div>
                  <div className="break-all font-medium">{share_status ?? "—"}</div>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <div className="text-muted-foreground">share_count</div>
                  <div className="break-all font-medium">{share_count ?? "0"}</div>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <div className="text-muted-foreground">request_url</div>
                  <div className="break-all font-medium">{request_url ?? "—"}</div>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <div className="text-muted-foreground">debug_id</div>
                  <div className="break-all font-medium">{debug_id ?? "—"}</div>
                </div>
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-[10px] leading-relaxed">
                {JSON.stringify(debugReport, null, 2)}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void copyDebugReport()}>
                  Tanı bilgisini kopyala
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void clearDebugReport()}>
                  Kayıtları temizle
                </Button>
                <Link
                  to="/share-analytics"
                  className="rounded-md border border-border/60 px-2 py-1 text-[11px] hover:bg-card"
                >
                  Tüm logları aç
                </Link>
              </div>
            </div>
          </details>
        )}

        {paramIssues.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            <div className="mb-1 font-semibold">Bağlantı parametreleri geçersiz</div>
            <ul className="ml-4 list-disc space-y-0.5">
              {paramIssues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/share-inbox", search: {} })}>
                Parametreleri temizle
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void navigate({ to: "/" })}>
                Ana sayfa
              </Button>
            </div>
          </div>
        )}

        {shareClass && (
          <div
            className={`mb-3 rounded-xl border p-3 text-xs ${
              shareClass.tone === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : shareClass.tone === "warn"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                  : "border-border/60 bg-card/60 text-foreground"
            }`}
          >
            <div className="mb-1 flex items-center gap-1 font-semibold">
              <AlertCircle className="h-3.5 w-3.5" />
              {shareClass.title}
            </div>
            <p className="mb-2 opacity-90">{shareClass.reason}</p>
            <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">Çözüm adımları</div>
            <ol className="ml-4 list-decimal space-y-0.5">
              {shareClass.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw className="mr-1 h-3 w-3" /> Sayfayı yenile
              </Button>
              <Link
                to="/share-analytics"
                className="rounded-md border border-border/60 px-2 py-1 text-[11px] hover:bg-card"
              >
                Hata loglarını aç
              </Link>
            </div>
          </div>
        )}

        {loadError && (
          <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <div className="mb-1 font-semibold">Paylaşım kutusu okunamadı</div>
            <p className="opacity-90">{loadError}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw className="mr-1 h-3 w-3" /> Tekrar dene
              </Button>
            </div>
          </div>
        )}

        {(canRetry || items.some((it) => itemStatus[it.id]?.phase === "retrying")) && (
          <div className="mb-3 space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            <div className="font-semibold">
              {failedItems.length || items.length} dosya tekrar deneme akışında
            </div>
            <ul className="space-y-1">
              {items.map((it) => {
                const st = itemStatus[it.id];
                if (!st) return null;
                if (st.phase === "retrying") {
                  const remaining = Math.max(0, Math.ceil((st.nextAttemptAt - tickNow) / 1000));
                  return (
                    <li key={it.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{it.name}</span>
                      <span className="font-mono text-[10px]">
                        {remaining}s · {st.attempt}/{retryConfig.maxAttempts} — {st.lastError}
                      </span>
                    </li>
                  );
                }
                if (st.phase === "error") {
                  return (
                    <li key={it.id} className="flex items-center justify-between gap-2 text-destructive">
                      <span className="truncate">{it.name}</span>
                      <span className="font-mono text-[10px]">
                        {st.attempts}/{retryConfig.maxAttempts} — {st.message}
                      </span>
                    </li>
                  );
                }
                if (st.phase === "processing") {
                  return (
                    <li key={it.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{it.name}</span>
                      <span className="font-mono text-[10px]">
                        deneme {st.attempt}/{retryConfig.maxAttempts}…
                      </span>
                    </li>
                  );
                }
                return null;
              })}
            </ul>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-background/40 p-2">
              <label className="flex flex-col gap-1 text-[10px]">
                <span className="uppercase tracking-wide opacity-70">Maks. deneme (1–10)</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={retryConfig.maxAttempts}
                  onChange={(e) =>
                    setRetryConfig({ ...retryConfig, maxAttempts: Number(e.target.value) || 1 })
                  }
                  className="rounded border border-border/60 bg-background px-2 py-1 text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px]">
                <span className="uppercase tracking-wide opacity-70">Aralık (ms, 250–60000)</span>
                <input
                  type="number"
                  min={250}
                  max={60000}
                  step={250}
                  value={retryConfig.delayMs}
                  onChange={(e) =>
                    setRetryConfig({ ...retryConfig, delayMs: Number(e.target.value) || 1500 })
                  }
                  className="rounded border border-border/60 bg-background px-2 py-1 text-foreground"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => retryAllFailed()}>
                <RefreshCw className={`mr-1 h-3 w-3 ${busy ? "animate-spin" : ""}`} />
                Şimdi yeniden dene
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void discard()}>
                Vazgeç
              </Button>
            </div>
          </div>
        )}


        {share_count && Number(share_count) > 0 && items.length > 0 && !shareClass && (
          <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
            {share_count} dosya alındı.
          </div>
        )}
        {swReady === false && (
          <div className="mb-3 rounded-xl border border-border/60 bg-card/60 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Bilgi:</strong> Android paylaş
            menüsünde MintMap'i görmek için uygulamayı önce "Ana ekrana ekle" ile
            yüklemen gerekiyor. Paylaşım hedefi, sadece yüklü PWA'da etkindir.
          </div>

        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Bekleyen paylaşım yok. Düğümleri yine de aşağıdan deep link olarak
              kopyalayabilirsin.
            </p>
            <Button className="mt-4" onClick={() => void navigate({ to: "/" })}>
              Ana sayfaya dön
            </Button>
          </div>
        ) : (
          <>
            <section className="mb-4">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Önizleme ({items.length} dosya)
              </h2>
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                {activePreview && (
                  <div className="relative aspect-video bg-muted">
                    {activePreview.thumbUrl ? (
                      <img
                        src={activePreview.thumbUrl}
                        alt={activePreview.name}
                        className="h-full w-full object-contain"
                      />
                    ) : activePreview.thumbError ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-destructive">
                        <AlertCircle className="h-6 w-6" />
                        <span className="text-xs">{activePreview.thumbError}</span>
                      </div>
                    ) : activePreview.kind === "pdf" ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span className="text-xs">PDF sayfaları render ediliyor…</span>
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <FileText className="h-6 w-6" />
                        <span className="text-xs">Önizleme yok</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-background/80 px-3 py-2 text-xs backdrop-blur">
                      <span className="truncate">
                        {activePreview.name}
                        {activePreview.pageCount ? ` · ${activePreview.pageCount} sayfa` : ""}
                      </span>
                      <span className="text-muted-foreground">{formatBytes(activePreview.size)}</span>
                    </div>
                  </div>
                )}
                {/* Per-PDF page strip when active is a PDF with multiple pages */}
                {activePreview?.kind === "pdf" && activePreview.thumbs.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto border-t border-border/60 bg-background/30 p-2">
                    {activePreview.thumbs.map((u, i) => (
                      <div
                        key={u}
                        className="h-20 w-16 shrink-0 overflow-hidden rounded border border-border/60 bg-muted"
                      >
                        <img src={u} alt={`Sayfa ${i + 1}`} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 overflow-x-auto p-2">
                  {previews.map((p) => {
                    const status = itemStatus[p.id];
                    return (
                      <div key={p.id} className="relative flex flex-col items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewId(p.id)}
                          className={`relative block h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                            p.id === activePreview?.id
                              ? "border-primary"
                              : "border-border/60 hover:border-border"
                          } ${status?.phase === "error" ? "ring-2 ring-destructive" : ""}`}
                        >
                          {p.thumbUrl ? (
                            <img src={p.thumbUrl} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                              {p.kind === "pdf" ? (
                                p.thumbError ? (
                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                ) : (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                )
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </div>
                          )}
                          {p.kind === "pdf" && p.pageCount && p.pageCount > 1 && (
                            <span className="absolute bottom-0 right-0 rounded-tl bg-background/80 px-1 text-[9px]">
                              {p.pageCount}p
                            </span>
                          )}
                        </button>
                        <StatusBadge s={status} />
                        <button
                          type="button"
                          aria-label="Bu dosyayı kaldır"
                          onClick={() => void removeOne(p.id)}
                          className="absolute -right-1 -top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground shadow ring-1 ring-border hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="mb-3">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Workspace
              </label>
              <Select value={currentId} onValueChange={(v) => mindmap.workspace.switch(v)}>
                <SelectTrigger className="w-full">
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
            </section>
          </>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Düğüm seç
            </h2>
            {defaults && (
              <span className="text-[10px] text-muted-foreground">
                Varsayılan: {nodes.find((n) => n.id === defaults.node)?.title ?? "—"}
              </span>
            )}
          </div>
          <ul className="space-y-1.5">
            {nodes.map((n) => {
              const isDefault = defaults?.ws === currentId && defaults?.node === n.id;
              const isSelected = selectedNodeId === n.id;
              return (
                <li
                  key={n.id}
                  className={`flex items-center gap-1 rounded-xl border pr-1 transition ${
                    isSelected
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                      : "border-border/60 bg-card/60 hover:bg-card"
                  }`}
                >
                  <button
                    type="button"
                    disabled={busy || !items.length}
                    onClick={() => setSelectedNodeId(n.id)}
                    aria-pressed={isSelected}
                    className="flex flex-1 items-center gap-3 px-3 py-2.5 text-left disabled:opacity-50"
                  >
                    <span
                      className="h-5 w-5 shrink-0 rounded-full border border-border/60"
                      style={{ background: n.color }}
                    />
                    <span className="flex-1 truncate text-sm">{n.title}</span>
                    {isSelected && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Seçildi
                      </span>
                    )}
                    {!isSelected && n.parentId === null && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        kök
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Varsayılan hedef yap"
                    onClick={() => void toggleDefault(n.id)}
                    className={`rounded-md p-2 transition hover:bg-muted ${
                      isDefault ? "text-yellow-500" : "text-muted-foreground"
                    }`}
                  >
                    <Star className="h-4 w-4" fill={isDefault ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    aria-label="Deep link kopyala"
                    onClick={() => void copyDeepLink(n.id)}
                    className="rounded-md p-2 text-muted-foreground transition hover:bg-muted"
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
            {items.length > 0 && (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const root = nodes.find((n) => n.parentId === null);
                    const created = mindmap.add(root?.id ?? null, "Paylaşılan görseller");
                    void assignTo(created.id);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-card disabled:opacity-50"
                >
                  + Yeni düğüm oluştur ve ekle
                </button>
              </li>
            )}
          </ul>
        </section>
      </main>

      {items.length > 0 && (
        <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => void discard()} disabled={busy}>
              Vazgeç
            </Button>
            <div className="flex items-center gap-2">
              {!selectedNodeId && (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Önce bir düğüm seç ↑
                </span>
              )}
              <Button
                onClick={() => selectedNodeId && void assignTo(selectedNodeId)}
                disabled={busy || !selectedNodeId}
                className="h-11 min-w-32"
                aria-label={
                  selectedNodeId
                    ? `${items.length} dosyayı seçili düğüme ekle`
                    : "Önce bir düğüm seçmelisin"
                }
                title={selectedNodeId ? undefined : "Önce yukarıdan bir düğüm seç"}
              >
                {busy
                  ? "Ekleniyor…"
                  : selectedNodeId
                    ? `Ekle (${items.length} dosya) →`
                    : `Ekle (${items.length} dosya)`}
              </Button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
