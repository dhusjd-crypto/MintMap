import { useEffect, useMemo, useRef, useState } from "react";
import {
  Crop as CropIcon,
  FlipHorizontal,
  FlipVertical,
  Image as ImageIcon,
  Maximize2,
  Minus,
  Move,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import {
  mindmap,
  type ImageAspect,
  type ImageFit,
  type MindImage,
  type MindNode,
} from "@/lib/mindmap-store";
import { compressImages } from "@/lib/image-compress";
import { getImageUrl, putImage } from "@/lib/image-blobs";
import {
  enqueueFiles,
  itemToFile,
  listQueueForNode,
  removeFromQueue,
  type QueueItem,
} from "@/lib/upload-queue";
import { cn } from "@/lib/utils";

import { CropOverlay } from "@/components/image/CropOverlay";

const cloneImages = (arr: MindImage[]): MindImage[] =>
  arr.map((i) => ({ ...i, focus: i.focus ? { ...i.focus } : undefined }));

const ASPECTS: Array<{ id: ImageAspect; label: string; cls: string }> = [
  { id: "auto", label: "Oto", cls: "" },
  { id: "1:1", label: "1:1", cls: "aspect-square" },
  { id: "16:9", label: "16:9", cls: "aspect-video" },
  { id: "4:3", label: "4:3", cls: "aspect-[4/3]" },
  { id: "3:4", label: "3:4", cls: "aspect-[3/4]" },
];

function readFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}


function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function cropDataUrl(
  src: string,
  rect: { x: number; y: number; w: number; h: number },
): Promise<string> {
  const img = await loadImg(src);
  const sx = Math.max(0, rect.x) * img.naturalWidth;
  const sy = Math.max(0, rect.y) * img.naturalHeight;
  const sw = Math.max(1, rect.w * img.naturalWidth);
  const sh = Math.max(1, rect.h * img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function transformDataUrl(
  src: string,
  op: { rotate?: 90 | -90 | 180; flip?: "h" | "v" },
): Promise<string> {
  const img = await loadImg(src);
  const canvas = document.createElement("canvas");
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const rot = op.rotate ?? 0;
  const swap = rot === 90 || rot === -90;
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  if (op.flip === "h") ctx.scale(-1, 1);
  if (op.flip === "v") ctx.scale(1, -1);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Persists a data URL to the blob store and returns what the node should hold.
 * Falls back to the inline data URL when IndexedDB is unavailable, so an image
 * is never lost outright — it just costs quota like before.
 */
async function storeImage(dataUrl: string): Promise<{ src: string; blobId?: string }> {
  const blobId = nanoid(12);
  if (!(await putImage(blobId, dataUrl))) return { src: dataUrl };
  // Go through getImageUrl so the object URL lands in the shared cache and gets
  // revoked when the image is deleted.
  return { src: (await getImageUrl(blobId)) ?? dataUrl, blobId };
}

function getImages(node: MindNode): MindImage[] {
  if (node.images && node.images.length) return node.images;
  if (node.image) {
    return [
      {
        id: "legacy",
        src: node.image,
        aspect: node.imageAspect ?? "auto",
        fit: node.imageFit ?? "cover",
      },
    ];
  }
  return [];
}

export function NodeImagePanel({ node, compact = false }: { node: MindNode; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [mode, setMode] = useState<"view" | "crop" | "focus">("view");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Undo/redo history scoped per node
  const historyRef = useRef<{ past: MindImage[][]; future: MindImage[][]; nodeId: string }>({
    past: [],
    future: [],
    nodeId: node.id,
  });
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (historyRef.current.nodeId !== node.id) {
      historyRef.current = { past: [], future: [], nodeId: node.id };
      setSelected(new Set());
      setMode("view");
      forceTick((n) => n + 1);
    }
  }, [node.id]);

  const images = useMemo(() => getImages(node), [node]);
  const active =
    images.find((i) => i.id === node.activeImageId) ?? images[0] ?? null;
  const aspect = active?.aspect ?? "auto";
  const fit = active?.fit ?? "cover";
  const focus = active?.focus ?? { x: 0.5, y: 0.5 };
  const aspectCls = ASPECTS.find((a) => a.id === aspect)?.cls ?? "";

  useEffect(() => {
    setImgLoaded(false);
  }, [active?.src]);

  

  const commit = (next: MindImage[], activeId?: string, opts: { history?: boolean } = { history: true }) => {
    if (opts.history !== false) {
      historyRef.current.past.push(cloneImages(images));
      if (historyRef.current.past.length > 30) historyRef.current.past.shift();
      historyRef.current.future = [];
    }
    const nextActive =
      activeId ?? (next.find((i) => i.id === node.activeImageId)?.id ?? next[0]?.id);
    const a = next.find((i) => i.id === nextActive);
    mindmap.update(node.id, {
      images: next,
      activeImageId: nextActive,
      image: a?.src,
      imageAspect: a?.aspect ?? "auto",
      imageFit: a?.fit ?? "cover",
    });
    forceTick((n) => n + 1);
  };

  const undo = () => {
    const prev = historyRef.current.past.pop();
    if (!prev) return;
    historyRef.current.future.push(cloneImages(images));
    commit(prev, undefined, { history: false });
    toast.message("Geri alındı");
  };
  const redo = () => {
    const nxt = historyRef.current.future.pop();
    if (!nxt) return;
    historyRef.current.past.push(cloneImages(images));
    commit(nxt, undefined, { history: false });
    toast.message("İleri alındı");
  };

  // Keyboard shortcuts while panel mounted
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Background upload progress (per panel instance)
  const [uploadProg, setUploadProg] = useState<{ done: number; total: number } | null>(null);
  const processingRef = useRef(false);

  const processQueueItems = async (items: QueueItem[]) => {
    if (!items.length || processingRef.current) return;
    processingRef.current = true;
    const toastId = `img-upload-${nanoid(4)}`;
    const total = items.length;
    setUploadProg({ done: 0, total });
    toast.loading(`Görseller hazırlanıyor… 0/${total}`, { id: toastId });
    let done = 0;
    let failed = 0;
    for (const item of items) {
      try {
        const [dataUrl] = await compressImages([itemToFile(item)]);
        const fresh = mindmap.getSnapshot().find((n) => n.id === node.id);
        const baseImages = fresh ? getImages(fresh) : [];
        // Bytes go to IndexedDB; the node keeps a short id plus a runtime URL.
        const { src, blobId } = await storeImage(dataUrl);
        const newImg: MindImage = {
          id: nanoid(6),
          src,
          blobId,
          aspect: "auto" as ImageAspect,
          fit: "cover" as ImageFit,
          focus: { x: 0.5, y: 0.5 },
        };
        const next = [...baseImages, newImg];
        mindmap.update(node.id, {
          images: next,
          activeImageId: newImg.id,
          image: newImg.src,
          imageAspect: "auto",
          imageFit: "cover",
        });
        await removeFromQueue([item.id]);
        done++;
      } catch {
        failed++;
      }
      setUploadProg({ done: done + failed, total });
      toast.loading(`İşleniyor ${done + failed}/${total} — ${item.name}`, { id: toastId });
    }
    setUploadProg(null);
    if (failed === 0) {
      toast.success(done === 1 ? "Görsel eklendi" : `${done} görsel eklendi`, { id: toastId });
    } else if (done > 0) {
      toast.warning(`${done}/${total} eklendi, ${failed} sırada bekliyor`, { id: toastId });
    } else {
      toast.error("Görseller işlenemedi, daha sonra yeniden denenecek", { id: toastId });
    }
    processingRef.current = false;
  };

  // Resume any pending uploads for this node after reload/tab close.
  useEffect(() => {
    let cancelled = false;
    void listQueueForNode(node.id).then((items) => {
      if (cancelled || !items.length) return;
      toast.message(`${items.length} bekleyen görsel kaldığı yerden devam ediyor`);
      void processQueueItems(items);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) {
      toast.error("Sadece görsel dosyaları");
      return;
    }
    const persisted = await enqueueFiles(node.id, arr);
    const items: QueueItem[] = persisted.length
      ? persisted
      : arr.map((f) => ({
          id: nanoid(8),
          nodeId: node.id,
          name: f.name,
          type: f.type,
          size: f.size,
          createdAt: Date.now(),
          file: f,
        }));
    await processQueueItems(items);
  };

  const updateActive = (patch: Partial<MindImage>) => {
    if (!active) return;
    commit(images.map((i) => (i.id === active.id ? { ...i, ...patch } : i)), active.id);
  };

  const removeActive = () => {
    if (!active) return;
    const next = images.filter((i) => i.id !== active.id);
    commit(next);
    if (!next.length) mindmap.update(node.id, { image: undefined, activeImageId: undefined });
    toast.success("Görsel kaldırıldı");
  };

  const applyCrop = async (rect: { x: number; y: number; w: number; h: number }) => {
    if (!active) return;
    try {
      const cropped = await cropDataUrl(active.srcOriginal ?? active.src, rect);
      const { src, blobId } = await storeImage(cropped);
      // The pre-crop image becomes the "original" so Reset still works after a
      // reload. Superseded blobs are left for sweepUnusedImageBlobs — undo
      // history still references them.
      updateActive({
        src,
        blobId,
        srcOriginal: active.srcOriginal ?? active.src,
        blobIdOriginal: active.blobIdOriginal ?? active.blobId,
      });
      setMode("view");
      toast.success("Kırpıldı");
    } catch {
      toast.error("Kırpma başarısız");
    }
  };

  const resetCrop = () => {
    if (!active?.srcOriginal) return;
    updateActive({
      src: active.srcOriginal,
      blobId: active.blobIdOriginal,
      srcOriginal: undefined,
      blobIdOriginal: undefined,
    });
    toast.success("Orijinale döndü");
  };

  const transformActive = async (op: { rotate?: 90 | -90 | 180; flip?: "h" | "v" }) => {
    if (!active) return;
    try {
      const transformed = await transformDataUrl(active.src, op);
      const { src, blobId } = await storeImage(transformed);
      updateActive({
        src,
        blobId,
        srcOriginal: active.srcOriginal ?? active.src,
        blobIdOriginal: active.blobIdOriginal ?? active.blobId,
      });
    } catch {
      toast.error("İşlem başarısız");
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files);
  };

  /* ----- Selection helpers ----- */
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(images.map((i) => i.id)));
  const bulkPatch = (patch: Partial<MindImage>) => {
    if (!selected.size) return;
    commit(images.map((i) => (selected.has(i.id) ? { ...i, ...patch } : i)));
    toast.success(`${selected.size} görsel güncellendi`);
  };
  const bulkRemove = () => {
    if (!selected.size) return;
    const next = images.filter((i) => !selected.has(i.id));
    commit(next);
    clearSelection();
    if (!next.length) mindmap.update(node.id, { image: undefined, activeImageId: undefined });
    toast.success("Seçilenler silindi");
  };

  /* ----- Reorder via drag ----- */
  const onThumbDragStart = (i: number) => (e: React.DragEvent) => {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  };
  const onThumbDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onThumbDrop = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIndex ?? Number(e.dataTransfer.getData("text/plain"));
    setDragIndex(null);
    if (Number.isNaN(from) || from === i) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    commit(next, active?.id);
    toast.success("Sıra güncellendi");
  };

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const selectionMode = selected.size > 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" />
        Düğüm görselleri {images.length > 0 && `(${images.length})`}
        <button
          onClick={() => inputRef.current?.click()}
          className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-foreground hover:bg-muted/70"
        >
          + Ekle
        </button>
        <button
          onClick={undo}
          disabled={!canUndo}
          className="rounded-full p-1 text-foreground hover:bg-muted disabled:opacity-30"
          aria-label="Geri al"
          title="Geri al (Ctrl+Z)"
        >
          <Undo2 className="h-3 w-3" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="rounded-full p-1 text-foreground hover:bg-muted disabled:opacity-30"
          aria-label="İleri al"
          title="İleri al (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-3 w-3" />
        </button>
        {active && !selectionMode && (
          <>
            <button
              onClick={() => setMode(mode === "crop" ? "view" : "crop")}
              className={cn(
                "rounded-full p-1 text-foreground hover:bg-muted",
                mode === "crop" && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
              aria-label="Kırp"
              title="Kırp"
            >
              <CropIcon className="h-3 w-3" />
            </button>
            <button
              onClick={() => setMode(mode === "focus" ? "view" : "focus")}
              disabled={fit !== "cover" || aspect === "auto"}
              className={cn(
                "rounded-full p-1 text-foreground hover:bg-muted disabled:opacity-30",
                mode === "focus" && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
              aria-label="Odak"
              title="Odak noktası"
            >
              <Move className="h-3 w-3" />
            </button>
            <button onClick={() => void transformActive({ rotate: -90 })} className="rounded-full p-1 hover:bg-muted" title="Sola döndür">
              <RotateCcw className="h-3 w-3" />
            </button>
            <button onClick={() => void transformActive({ rotate: 90 })} className="rounded-full p-1 hover:bg-muted" title="Sağa döndür">
              <RotateCw className="h-3 w-3" />
            </button>
            <button onClick={() => void transformActive({ flip: "h" })} className="rounded-full p-1 hover:bg-muted" title="Yatay çevir">
              <FlipHorizontal className="h-3 w-3" />
            </button>
            <button onClick={() => void transformActive({ flip: "v" })} className="rounded-full p-1 hover:bg-muted" title="Dikey çevir">
              <FlipVertical className="h-3 w-3" />
            </button>
            {active.srcOriginal && (
              <button onClick={resetCrop} className="rounded-full p-1 hover:bg-muted" title="Orijinale döndür">
                <Undo2 className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={removeActive}
              className="rounded-full p-1 text-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Görseli sil"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Bulk selection bar */}
      {selectionMode && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-primary/10 px-2 py-1.5 text-[10px] font-semibold">
          <span className="normal-case">{selected.size} seçili</span>
          <span className="ml-1 uppercase text-muted-foreground">Oran</span>
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => bulkPatch({ aspect: a.id })}
              className="rounded-full bg-card px-2 py-0.5 hover:bg-muted"
            >
              {a.label}
            </button>
          ))}
          <span className="ml-1 uppercase text-muted-foreground">Sığdır</span>
          {(["cover", "contain"] as const).map((f) => (
            <button
              key={f}
              onClick={() => bulkPatch({ fit: f })}
              className="rounded-full bg-card px-2 py-0.5 hover:bg-muted"
            >
              {f === "cover" ? "Doldur" : "Sığdır"}
            </button>
          ))}
          <button onClick={selectAll} className="ml-auto rounded-full bg-card px-2 py-0.5 hover:bg-muted">
            Tümü
          </button>
          <button onClick={clearSelection} className="rounded-full bg-card px-2 py-0.5 hover:bg-muted">
            Temizle
          </button>
          <button
            onClick={bulkRemove}
            className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive hover:bg-destructive/20"
          >
            Sil
          </button>
        </div>
      )}

      <button
        type="button"
        data-testid="image-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "mb-2 flex min-h-24 w-full touch-manipulation select-none flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 active:scale-[0.99] sm:min-h-16 sm:flex-row sm:gap-2 sm:py-3",
          dragOver && "scale-[1.01] border-primary bg-primary/15 text-primary shadow-lg ring-2 ring-primary/40",
        )}
      >
        <Upload className={cn("h-5 w-5 sm:h-4 sm:w-4", dragOver && "animate-bounce")} />
        <span className="text-center leading-tight">
          {dragOver ? "Bırakınca eklenecek" : "Görsel ekle / üzerine sürükle"}
        </span>
        <span className="text-[10px] font-normal text-muted-foreground sm:hidden">
          Dokun veya sürükle
        </span>
      </button>


      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "relative w-full overflow-hidden rounded-xl bg-muted/40 transition-colors",
          aspectCls,
          dragOver && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        )}
      >
        {active ? (
          mode === "crop" ? (
            <CropOverlay
              src={active.srcOriginal ?? active.src}
              aspectCls={aspectCls}
              onCancel={() => setMode("view")}
              onApply={applyCrop}
            />
          ) : mode === "focus" ? (
            <FocusOverlay
              src={active.src}
              focus={focus}
              aspectCls={aspectCls}
              onChange={(f) => updateActive({ focus: f })}
              onDone={() => setMode("view")}
            />
          ) : (
            <>
              {!imgLoaded && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/60 via-muted/30 to-muted/60" />
              )}
              <img
                key={active.src}
                src={active.src}
                alt={node.title}
                loading="lazy"
                decoding="async"
                onLoad={() => setImgLoaded(true)}
                onClick={() => setLightbox(true)}
                style={
                  fit === "cover"
                    ? { objectPosition: `${focus.x * 100}% ${focus.y * 100}%` }
                    : undefined
                }
                className={cn(
                  "w-full cursor-zoom-in transition-opacity duration-300",
                  imgLoaded ? "opacity-100" : "opacity-0",
                  aspect === "auto"
                    ? fit === "cover"
                      ? "h-[50vh] object-cover"
                      : "max-h-[50vh] object-contain"
                    : fit === "cover"
                      ? "h-full object-cover"
                      : "h-full object-contain",
                )}
                draggable={false}
              />
              <button
                onClick={() => setLightbox(true)}
                className="absolute right-2 top-2 rounded-full bg-card/90 p-1.5 text-foreground shadow-soft hover:bg-card"
                aria-label="Tam ekran önizle"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-[11px] font-semibold text-foreground shadow-soft hover:bg-card"
                aria-label="Yeni görsel ekle"
              >
                <Upload className="h-3 w-3" /> Ekle
              </button>
              {dragOver && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 border-4 border-dashed border-primary bg-primary/30 text-sm font-bold text-primary-foreground backdrop-blur-md">
                  <Upload className="h-8 w-8 animate-bounce text-primary" />
                  <span className="rounded-full bg-primary px-3 py-1 text-primary-foreground shadow-lg">
                    Bırakınca eklenecek
                  </span>
                </div>
              )}
            </>
          )
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-muted/40",
              aspectCls || "h-28",
            )}
          >
            <Upload className="h-4 w-4" />
            {dragOver ? "Bırak..." : "Görsel sürükle-bırak ya da seç"}
          </button>
        )}
        {uploadProg && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-card/90 px-3 py-2 backdrop-blur-sm">
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-foreground">
              <span>Sıkıştırılıyor… {uploadProg.done}/{uploadProg.total}</span>
              <span className="text-muted-foreground">
                {Math.round((uploadProg.done / uploadProg.total) * 100)}%
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${(uploadProg.done / uploadProg.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Gallery thumbs — drag to reorder, click to activate, checkbox to multi-select */}
      {images.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {images.map((im, i) => {
            const isSel = selected.has(im.id);
            const isActive = im.id === (active?.id ?? "");
            return (
              <div
                key={im.id}
                draggable
                onDragStart={onThumbDragStart(i)}
                onDragOver={onThumbDragOver}
                onDrop={onThumbDrop(i)}
                onDragEnd={() => setDragIndex(null)}
                className={cn(
                  "group relative h-14 w-14 shrink-0 cursor-grab overflow-hidden rounded-md border-2 transition-colors active:cursor-grabbing",
                  isActive ? "border-primary" : "border-transparent hover:border-border",
                  dragIndex === i && "opacity-50",
                  isSel && "ring-2 ring-primary",
                )}
                onClick={() => commit(images, im.id, { history: false })}
              >
                <img src={im.src} alt="" className="h-full w-full object-cover pointer-events-none" draggable={false} />
                <button
                  onClick={(e) => toggleSelect(im.id, e)}
                  className={cn(
                    "absolute left-0.5 top-0.5 h-4 w-4 rounded border-2 text-[8px] font-bold leading-none transition-opacity",
                    isSel
                      ? "border-primary bg-primary text-primary-foreground opacity-100"
                      : "border-card bg-card/80 text-transparent opacity-0 group-hover:opacity-100",
                  )}
                  aria-label="Seç"
                  title="Toplu işlem için seç"
                >
                  ✓
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!compact && active && mode === "view" && !selectionMode && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Oran</span>
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => updateActive({ aspect: a.id })}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                aspect === a.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {a.label}
            </button>
          ))}
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sığdır</span>
          {(["cover", "contain"] as const).map((f) => (
            <button
              key={f}
              onClick={() => updateActive({ fit: f })}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                fit === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {f === "cover" ? "Doldur" : "Sığdır"}
            </button>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {lightbox && active && (
        <Lightbox src={active.src} alt={node.title} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}




/* ---------- Focus / pan overlay ---------- */

function FocusOverlay({
  src,
  focus,
  aspectCls,
  onChange,
  onDone,
}: {
  src: string;
  focus: { x: number; y: number };
  aspectCls: string;
  onChange: (f: { x: number; y: number }) => void;
  onDone: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const setFromEvent = (e: React.PointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange({ x, y });
  };

  return (
    <div
      ref={boxRef}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setFromEvent(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) setFromEvent(e);
      }}
      className={cn("relative h-full w-full cursor-crosshair select-none touch-none", aspectCls || "min-h-[200px]")}
    >
      <img
        src={src}
        alt=""
        style={{ objectPosition: `${focus.x * 100}% ${focus.y * 100}%` }}
        className="pointer-events-none h-full w-full object-cover"
        draggable={false}
      />
      <div
        className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card/80 shadow-leaf"
        style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
      />
      <div className="absolute inset-x-0 bottom-2 flex justify-center">
        <button
          onClick={onDone}
          className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-soft"
        >
          Tamam
        </button>
      </div>
    </div>
  );
}

/* ---------- Lightbox ---------- */

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef({ scale: 1, pos: { x: 0, y: 0 } });
  stateRef.current = { scale, pos };
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{
    startDist: number;
    startScale: number;
    startMid: { x: number; y: number };
    startPos: { x: number; y: number };
  } | null>(null);
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const [gesturing, setGesturing] = useState(false);

  const clamp = (s: number) => Math.max(0.5, Math.min(6, s));
  const reset = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };

  // Anchor zoom to the actual on-screen image rect — handles letterboxing
  // from object-contain and any future centering offsets precisely.
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const { scale: s0, pos: p0 } = stateRef.current;
    const newScale = clamp(s0 * factor);
    const r = imgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) {
      setScale(newScale);
      return;
    }
    // r is post-transform; current image center on screen:
    const ix = r.left + r.width / 2;
    const iy = r.top + r.height / 2;
    const dx = clientX - ix;
    const dy = clientY - iy;
    const k = newScale / s0;
    // Translation needed so the (dx, dy) point stays under (clientX, clientY)
    // after scaling around the image element's center.
    setScale(newScale);
    setPos({ x: p0.x + dx * (1 - k), y: p0.y + dy * (1 - k) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setScale((s) => clamp(s * 1.2));
      if (e.key === "-") setScale((s) => clamp(s / 1.2));
      if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(e.clientX, e.clientY, factor);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesturing(true);
    if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      gestureRef.current = {
        startDist: Math.hypot(dx, dy) || 1,
        startScale: stateRef.current.scale,
        startMid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        startPos: { ...stateRef.current.pos },
      };
      panRef.current = null;
    } else {
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: stateRef.current.pos.x,
        oy: stateRef.current.pos.y,
        moved: 0,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && gestureRef.current) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const g = gestureRef.current;
      const newScale = clamp(g.startScale * (dist / g.startDist));
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const k = newScale / g.startScale;
      const nx = mid.x - cx - (g.startMid.x - cx - g.startPos.x) * k;
      const ny = mid.y - cy - (g.startMid.y - cy - g.startPos.y) * k;
      setScale(newScale);
      setPos({ x: nx, y: ny });
    } else if (pointers.current.size === 1 && panRef.current) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      panRef.current.moved = Math.max(panRef.current.moved, Math.hypot(dx, dy));
      setPos({ x: panRef.current.ox + dx, y: panRef.current.oy + dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const had = pointers.current.has(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gestureRef.current = null;
    if (pointers.current.size === 0) {
      const moved = panRef.current?.moved ?? 999;
      panRef.current = null;
      setGesturing(false);
      if (had && moved < 8) {
        const now = Date.now();
        const last = lastTapRef.current;
        if (last && now - last.t < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
          if (stateRef.current.scale > 1.05) reset();
          else zoomAt(e.clientX, e.clientY, 2.5);
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };
        }
      }
    } else if (pointers.current.size === 1) {
      const remaining = Array.from(pointers.current.values())[0];
      panRef.current = {
        x: remaining.x,
        y: remaining.y,
        ox: stateRef.current.pos.x,
        oy: stateRef.current.pos.y,
        moved: 0,
      };
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-bark/80 backdrop-blur-sm animate-fade-in"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-card/90 p-2 text-foreground hover:bg-card"
        aria-label="Kapat"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-card/95 p-1 shadow-leaf">
        <IconBtn onClick={(e) => { e.stopPropagation(); setScale((s) => clamp(s / 1.2)); }} label="Uzaklaştır">
          <Minus className="h-4 w-4" />
        </IconBtn>
        <span className="min-w-[3rem] text-center text-xs font-semibold tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <IconBtn onClick={(e) => { e.stopPropagation(); setScale((s) => clamp(s * 1.2)); }} label="Yakınlaştır">
          <Plus className="h-4 w-4" />
        </IconBtn>
        <IconBtn onClick={(e) => { e.stopPropagation(); reset(); }} label="Sıfırla">
          <RotateCcw className="h-4 w-4" />
        </IconBtn>
      </div>
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex h-full max-h-[88vh] w-full max-w-[92vw] cursor-grab touch-none items-center justify-center overflow-hidden active:cursor-grabbing"
      >
        {!loaded && (
          <div className="absolute h-32 w-32 animate-pulse rounded-2xl bg-card/40" />
        )}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          decoding="async"
          onLoad={() => setLoaded(true)}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: gesturing ? "none" : "transform 0.15s ease-out",
            opacity: loaded ? 1 : 0,
          }}
          className="max-h-[88vh] max-w-[92vw] select-none object-contain transition-opacity duration-200"
        />
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-full p-1.5 text-foreground hover:bg-muted"
    >
      {children}
    </button>
  );
}

