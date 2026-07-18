import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import {
  Plus,
  Link2,
  Image as ImageIcon,
  Pin,
  Trash2,
  Sparkles,
  Loader2,
  ExternalLink,
  Wand2,
  Share2,
  Search,
  X,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BottomNav } from "@/components/BottomNav";
import { useCards, keep, UNCATEGORIZED, type KeepCard } from "@/lib/keep-store";
import { aiCategorizeCard, aiStatus } from "@/lib/ai.functions";
import { fetchLinkMeta } from "@/lib/link.functions";
import { compressImages } from "@/lib/image-compress";
import { shareContent } from "@/lib/share";
import { listShared, clearShared, sharedToFile } from "@/lib/share-inbox";
import { putImage, getImageUrl, getImageDataUrl } from "@/lib/image-blobs";

export const Route = createFileRoute("/keep")({
  head: () => ({
    meta: [
      { title: "Kutu — MintMap" },
      {
        name: "description",
        content:
          "Beğendiğin ekran görüntülerini, siteleri, filmleri ve fırsatları at; AI senin için kategorize etsin.",
      },
    ],
  }),
  component: KeepPage,
});

const URL_RE = /^(https?:\/\/\S+|www\.\S+|[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?)$/i;
function looksLikeUrl(s: string) {
  return URL_RE.test(s.trim());
}
function normalizeUrl(s: string) {
  const v = s.trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
function hostOf(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function aiPrefs(): { provider?: "openai" | "gateway"; model?: string } {
  if (typeof window === "undefined") return {};
  const provider = localStorage.getItem("mintmap.ai.provider") as "openai" | "gateway" | null;
  const model = localStorage.getItem("mintmap.ai.model") || undefined;
  return { provider: provider ?? undefined, model };
}

// Deterministic pastel accent per category so groups are visually distinct.
function catHue(cat: string): number {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) % 360;
  return h;
}

function KeepPage() {
  const cards = useCards();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const categorize = useServerFn(aiCategorizeCard);
  const linkMeta = useServerFn(fetchLinkMeta);
  const status = useServerFn(aiStatus);

  const addLinkCard = (rawUrl: string, enabled: boolean, presetTitle?: string) => {
    const url = normalizeUrl(rawUrl);
    const card = keep.add({ type: "link", url, title: presetTitle, aiPending: enabled });
    linkMeta({ data: { url } })
      .then((m) => {
        keep.update(card.id, {
          url: m.url,
          title: card.title || m.title,
          meta: { description: m.description, image: m.image, siteName: m.siteName },
        });
        if (enabled) runCategorize(keep.get(card.id) ?? card);
      })
      .catch(() => {
        if (enabled) runCategorize(card);
      });
  };

  // Images go to the IndexedDB blob store; the card only holds a short id.
  // Falls back to an inline data URL if IDB is unavailable.
  async function addImageCard(dataUrl: string, enabled: boolean) {
    const imageId = nanoid(12);
    const stored = await putImage(imageId, dataUrl);
    const card = keep.add(
      stored
        ? { type: "image", imageId, aiPending: enabled }
        : { type: "image", image: dataUrl, aiPending: enabled },
    );
    if (enabled) void runCategorize(card);
    return card;
  }

  // One-time move of legacy inline base64 images into the blob store so old
  // cards stop eating the localStorage quota.
  async function migrateLegacyImages() {
    for (const c of keep.list()) {
      if (!c.image || c.imageId) continue;
      const id = nanoid(12);
      if (await putImage(id, c.image)) keep.update(c.id, { imageId: id, image: undefined });
    }
  }

  // Pull anything shared into the app (Android/iOS share sheet → Web Share
  // Target → IndexedDB inbox) and turn it into cards: images, links, notes.
  async function ingestShares(enabled: boolean) {
    let items;
    try {
      items = await listShared();
    } catch {
      return;
    }
    if (!items.length) return;
    const ids: string[] = [];
    for (const it of items) {
      ids.push(it.id);
      try {
        if (it.type.startsWith("image/")) {
          const [dataUrl] = await compressImages([sharedToFile(it)], { maxDim: 1600, quality: 0.8 });
          await addImageCard(dataUrl, enabled);
          continue;
        }
        const rawUrl = (it.meta?.url || "").trim();
        const body = [it.meta?.title, it.meta?.text].filter(Boolean).join("\n").trim();
        if (rawUrl && looksLikeUrl(rawUrl)) {
          addLinkCard(rawUrl, enabled, it.meta?.title || undefined);
        } else if (body) {
          if (looksLikeUrl(body)) addLinkCard(body, enabled);
          else {
            const card = keep.add({ type: "note", text: body, aiPending: enabled });
            if (enabled) runCategorize(card);
          }
        } else {
          const txt = (await sharedToFile(it).text()).trim();
          if (txt && looksLikeUrl(txt)) addLinkCard(txt, enabled);
          else if (txt) {
            const card = keep.add({ type: "note", text: txt, aiPending: enabled });
            if (enabled) runCategorize(card);
          }
        }
      } catch {
        /* skip a bad item, keep going */
      }
    }
    try {
      await clearShared(ids);
    } catch {
      /* ignore */
    }
    toast.success(items.length > 1 ? `${items.length} paylaşım Kutu'ya eklendi` : "Paylaşım Kutu'ya eklendi");
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let enabled = false;
      try {
        const s = await status();
        // demo === nothing configured; only auto-categorize with a real
        // provider so demo answers never pollute the user's categories.
        enabled = !s.demo;
      } catch {
        /* provider layer unreachable */
      }
      if (cancelled) return;
      setAiEnabled(enabled);
      await migrateLegacyImages();
      await ingestShares(enabled);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCategorize(card: KeepCard) {
    keep.update(card.id, { aiPending: true });
    try {
      const { provider, model } = aiPrefs();
      // Vision needs the actual bytes — pull them back out of the blob store.
      const imageData =
        card.type === "image"
          ? card.imageId
            ? ((await getImageDataUrl(card.imageId)) ?? undefined)
            : card.image
          : undefined;
      const res = await categorize({
        data: {
          type: card.type,
          text: card.text,
          url: card.url,
          title: card.title,
          description: card.meta?.description,
          image: imageData,
          existing: keep.categories(),
          provider,
          model,
        },
      });
      keep.update(card.id, {
        category: res.category,
        tags: res.tags.length ? res.tags : card.tags,
        title: card.title ?? res.title,
        aiPending: false,
      });
    } catch (e) {
      keep.update(card.id, { aiPending: false });
      toast.error((e as Error).message);
    }
  }

  function addFromText() {
    const v = text.trim();
    if (!v || busy) return;
    setText("");
    setBusy(true);
    try {
      if (looksLikeUrl(v)) {
        addLinkCard(v, aiEnabled);
      } else {
        const card = keep.add({ type: "note", text: v, aiPending: aiEnabled });
        if (aiEnabled) runCategorize(card);
      }
    } finally {
      setBusy(false);
    }
  }

  async function addImages(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    const t = toast.loading(files.length > 1 ? `${files.length} görsel ekleniyor…` : "Görsel ekleniyor…");
    try {
      const urls = await compressImages(files, { maxDim: 1600, quality: 0.8 });
      for (const src of urls) {
        await addImageCard(src, aiEnabled);
      }
      toast.success("Eklendi", { id: t });
    } catch {
      toast.error("Görsel eklenemedi", { id: t });
    } finally {
      setBusy(false);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgs: File[] = [];
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) imgs.push(f);
      }
    }
    if (imgs.length) {
      e.preventDefault();
      void addImages(imgs);
    }
  }

  async function categorizeAll() {
    const pending = cards.filter((c) => !c.category);
    if (!pending.length) return;
    if (!aiEnabled) {
      toast.error("AI sağlayıcı yapılandırılmamış — Ayarlar'dan bir anahtar ekle");
      return;
    }
    setBulkBusy(true);
    for (const c of pending) {
      await runCategorize(keep.get(c.id) ?? c);
    }
    setBulkBusy(false);
  }

  const allCategories = useMemo(() => keep.categories(), [cards]);
  const uncategorizedCount = useMemo(() => cards.filter((c) => !c.category).length, [cards]);

  const { pinned, groups } = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = cards;
    if (q) {
      filtered = filtered.filter((c) =>
        [c.title, c.text, c.url, c.category, ...(c.tags ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (filter) filtered = filtered.filter((c) => (c.category?.trim() || UNCATEGORIZED) === filter);
    const pinnedCards = filtered.filter((c) => c.pinned);
    const rest = filtered.filter((c) => !c.pinned);
    const map = new Map<string, KeepCard[]>();
    rest.forEach((c) => {
      const k = c.category?.trim() || UNCATEGORIZED;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    });
    // Uncategorized last, others by size desc.
    const entries = [...map.entries()].sort((a, b) => {
      if (a[0] === UNCATEGORIZED) return 1;
      if (b[0] === UNCATEGORIZED) return -1;
      return b[1].length - a[1].length;
    });
    return { pinned: pinnedCards, groups: entries };
  }, [cards, filter, query]);

  return (
    <main className="relative flex h-svh w-full flex-col">
      <header className="z-10 flex items-center justify-between gap-2 px-5 pt-5 pb-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-none">Kutu</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            {cards.length
              ? `${cards.length} kart${uncategorizedCount ? ` · ${uncategorizedCount} kategorisiz` : ""}`
              : "Ekran görüntüsü, link, film, fırsat — at, AI düzenlesin"}
          </p>
        </div>
        {uncategorizedCount > 0 && (
          <button
            onClick={categorizeAll}
            disabled={bulkBusy}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft disabled:opacity-50"
          >
            {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Hepsini kategorize et
          </button>
        )}
      </header>

      {/* Composer */}
      <div className="px-4 pb-2">
        <div className="rounded-2xl bg-card p-2.5 shadow-soft">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                addFromText();
              }
            }}
            rows={2}
            placeholder="Not yaz, link yapıştır veya görsel yapıştır…"
            className="max-h-40 w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none"
          />
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <ImageIcon className="h-4 w-4" /> Görsel
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void addImages(files);
              }}
            />
            <button
              onClick={addFromText}
              disabled={!text.trim() || busy}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Ekle
            </button>
          </div>
        </div>
        {!aiEnabled && cards.length > 0 && (
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            AI bağlantısı yapılmadı — kartlar otomatik sınıflanmıyor. Ayarlar'dan bir sağlayıcı
            (OpenRouter / Gemini / OpenAI) bağlayınca devreye girer.
          </p>
        )}
      </div>

      {/* Search */}
      {cards.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 shadow-soft">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Kutuda ara…"
              aria-label="Kutuda ara"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Aramayı temizle"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Category filter chips */}
      {(allCategories.length > 0 || uncategorizedCount > 0) && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 no-scrollbar">
          <Chip active={filter === null} onClick={() => setFilter(null)}>
            Tümü
          </Chip>
          {allCategories.map((c) => (
            <Chip key={c} active={filter === c} onClick={() => setFilter(c)} hue={catHue(c)}>
              {c}
            </Chip>
          ))}
          {uncategorizedCount > 0 && (
            <Chip active={filter === UNCATEGORIZED} onClick={() => setFilter(UNCATEGORIZED)}>
              {UNCATEGORIZED}
            </Chip>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {cards.length === 0 ? (
          <EmptyState onPickImage={() => fileRef.current?.click()} />
        ) : pinned.length === 0 && groups.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Eşleşen kart yok.</p>
        ) : (
          <>
            {pinned.length > 0 && (
              <Section title="📌 Sabitlenenler">
                <Masonry>
                  {pinned.map((c) => (
                    <Card key={c.id} card={c} onCategorize={() => runCategorize(c)} aiEnabled={aiEnabled} />
                  ))}
                </Masonry>
              </Section>
            )}
            {groups.map(([cat, list]) => (
              <Section key={cat} title={cat} hue={cat === UNCATEGORIZED ? undefined : catHue(cat)} count={list.length}>
                <Masonry>
                  {list.map((c) => (
                    <Card key={c.id} card={c} onCategorize={() => runCategorize(c)} aiEnabled={aiEnabled} />
                  ))}
                </Masonry>
              </Section>
            ))}
          </>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

function Chip({
  children,
  active,
  onClick,
  hue,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  hue?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
      }`}
      style={!active && hue !== undefined ? { color: `oklch(0.55 0.12 ${hue})` } : undefined}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  count,
  hue,
  children,
}: {
  title: string;
  count?: number;
  hue?: number;
  children: ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: hue !== undefined ? `oklch(0.7 0.12 ${hue})` : "var(--muted-foreground)" }}
        />
        <h2 className="text-sm font-bold">{title}</h2>
        {count !== undefined && <span className="text-[11px] text-muted-foreground">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function Masonry({ children }: { children: ReactNode }) {
  return <div className="columns-2 gap-3 md:columns-3 lg:columns-4">{children}</div>;
}

/** Resolves an image card's blob into a cached object URL (legacy cards keep their data URL). */
function useCardImage(card: KeepCard): string | undefined {
  const [url, setUrl] = useState<string | undefined>(card.image);
  useEffect(() => {
    let alive = true;
    if (card.imageId) {
      void getImageUrl(card.imageId).then((u) => {
        if (alive) setUrl(u ?? undefined);
      });
    } else {
      setUrl(card.image);
    }
    return () => {
      alive = false;
    };
  }, [card.imageId, card.image]);
  return url;
}

function Card({
  card,
  onCategorize,
  aiEnabled,
}: {
  card: KeepCard;
  onCategorize: () => void;
  aiEnabled: boolean;
}) {
  const imgUrl = useCardImage(card);
  const thumb = card.type === "image" ? imgUrl : card.meta?.image;
  return (
    <div className="group mb-3 break-inside-avoid overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-leaf hover:ring-primary/30">
      {thumb && (
        <a
          href={card.url || undefined}
          target={card.url ? "_blank" : undefined}
          rel="noreferrer"
          className="block"
        >
          <img
            src={thumb}
            alt={card.title ?? "kart"}
            loading="lazy"
            className="max-h-72 w-full object-cover"
          />
        </a>
      )}
      <div className="space-y-1.5 p-3">
        {card.title && <p className="text-sm font-semibold leading-snug">{card.title}</p>}
        {card.type === "note" && card.text && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{card.text}</p>
        )}
        {card.url && (
          <a
            href={card.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{hostOf(card.url)}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
          </a>
        )}
        {card.tags && card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {card.tags.map((t) => (
              <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-0.5 pt-1 text-muted-foreground">
          {card.aiPending ? (
            <span className="mr-auto flex items-center gap-1 text-[11px] text-primary">
              <Loader2 className="h-3 w-3 animate-spin" /> kategorize ediliyor…
            </span>
          ) : (
            <button
              onClick={onCategorize}
              title={aiEnabled ? "AI ile kategorize et" : "AI anahtarı gerekli"}
              className="rounded-lg p-1.5 hover:bg-muted hover:text-foreground"
              aria-label="Kategorize et"
            >
              <Wand2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={async () => {
              const imageDataUrl =
                card.type === "image"
                  ? card.imageId
                    ? ((await getImageDataUrl(card.imageId)) ?? undefined)
                    : card.image
                  : undefined;
              void shareContent({
                title: card.title,
                text: card.type === "note" ? card.text : card.title,
                url: card.url,
                imageDataUrl,
              });
            }}
            className="rounded-lg p-1.5 hover:bg-muted hover:text-foreground"
            aria-label="Paylaş"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => keep.togglePin(card.id)}
            className={`rounded-lg p-1.5 hover:bg-muted hover:text-foreground ${card.pinned ? "text-primary" : ""}`}
            aria-label={card.pinned ? "Sabiti kaldır" : "Sabitle"}
          >
            <Pin className="h-4 w-4" fill={card.pinned ? "currentColor" : "none"} />
          </button>
          <button
            onClick={() => keep.remove(card.id)}
            className="rounded-lg p-1.5 hover:bg-destructive/10 hover:text-destructive"
            aria-label="Sil"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPickImage }: { onPickImage: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <p className="text-sm font-semibold">Kutun boş</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        Beğendiğin bir ekran görüntüsünü, bir siteyi, filmi veya yatırım fırsatını buraya at — AI
        senin için kategorilere ayırsın.
      </p>
      <button
        onClick={onPickImage}
        className="mt-4 flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        <ImageIcon className="h-4 w-4" /> Görsel ekle
      </button>
    </div>
  );
}
