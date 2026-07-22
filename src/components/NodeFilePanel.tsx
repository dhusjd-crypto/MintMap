import { useEffect, useRef, useState } from "react";
import { Download, FileText, File as FileIcon, Loader2, Music, Paperclip, Trash2, Video } from "lucide-react";
import { toast } from "sonner";

import { mindmap, type MindFile, type MindNode } from "@/lib/mindmap-store";
import { getImage, getImageUrl } from "@/lib/image-blobs";
import { cn } from "@/lib/utils";

/** Per-node attachments: PDFs, documents, audio — anything that isn't an image. */

const MAX_FILE_MB = 25;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindIcon(type: string) {
  if (type === "application/pdf") return FileText;
  if (type.startsWith("audio/")) return Music;
  if (type.startsWith("video/")) return Video;
  return FileIcon;
}

/** First-page thumbnail for PDFs; cached per blobId for the session. */
const thumbCache = new Map<string, string>();

function PdfThumb({ blobId }: { blobId: string }) {
  const [url, setUrl] = useState<string | null>(thumbCache.get(blobId) ?? null);
  useEffect(() => {
    if (url) return;
    let cancelled = false;
    (async () => {
      const blob = await getImage(blobId);
      if (!blob || cancelled) return;
      try {
        const { renderPdf } = await import("@/lib/pdf-thumbs");
        const r = await renderPdf(blob, { maxPages: 1, scale: 0.4 });
        const u = r.pages[0]?.url;
        if (u && !cancelled) {
          thumbCache.set(blobId, u);
          setUrl(u);
        }
      } catch {
        /* thumbnail is best-effort; the row still renders with an icon */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blobId, url]);

  if (!url) return <FileText className="h-5 w-5 text-muted-foreground" />;
  return <img src={url} alt="" className="h-10 w-8 rounded-sm border border-border object-cover" />;
}

function FileRow({ nodeId, file }: { nodeId: string; file: MindFile }) {
  const [busy, setBusy] = useState(false);
  const Icon = kindIcon(file.type);
  const isPdf = file.type === "application/pdf";

  const open = async () => {
    setBusy(true);
    const url = await getImageUrl(file.blobId);
    setBusy(false);
    if (!url) {
      toast.error("Dosya bulunamadı — bu cihazda yüklenmemiş olabilir");
      return;
    }
    // Browsers preview PDFs/audio/video in a tab; everything else downloads.
    const a = document.createElement("a");
    a.href = url;
    if (isPdf || file.type.startsWith("audio/") || file.type.startsWith("video/")) {
      a.target = "_blank";
      a.rel = "noopener";
    } else {
      a.download = file.name;
    }
    a.click();
  };

  const download = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = await getImageUrl(file.blobId);
    if (!url) {
      toast.error("Dosya bulunamadı");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
  };

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    mindmap.removeFile(nodeId, file.id);
    toast.success(`'${file.name}' kaldırıldı`, {
      action: { label: "Geri al", onClick: () => mindmap.undo() },
    });
  };

  return (
    <li>
      <button
        type="button"
        onClick={open}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-2.5 py-2 text-left transition hover:bg-muted/60"
      >
        <span className="flex h-10 w-8 shrink-0 items-center justify-center">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : isPdf ? (
            <PdfThumb blobId={file.blobId} />
          ) : (
            <Icon className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{file.name}</span>
          <span className="block text-[11px] text-muted-foreground">
            {fmtSize(file.size)}
            {isPdf && " · PDF"}
          </span>
        </span>
        <span
          onClick={download}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && download(e as unknown as React.MouseEvent)}
          className="shrink-0 rounded-md p-1.5 hover:bg-muted"
          aria-label={`${file.name} — indir`}
        >
          <Download className="h-3.5 w-3.5" />
        </span>
        <span
          onClick={remove}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && remove(e as unknown as React.MouseEvent)}
          className="shrink-0 rounded-md p-1.5 text-destructive hover:bg-destructive/10"
          aria-label={`${file.name} — kaldır`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </span>
      </button>
    </li>
  );
}

export function NodeFilePanel({ node }: { node: MindNode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [adding, setAdding] = useState(0);
  const files = node.files ?? [];

  const addFiles = async (list: FileList | File[]) => {
    // Images belong in the image panel where they get compression + editing.
    const arr = Array.from(list).filter((f) => !f.type.startsWith("image/"));
    if (!arr.length) {
      toast.error("Görselleri üstteki görsel alanına ekle");
      return;
    }
    for (const f of arr) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`'${f.name}' çok büyük (sınır ${MAX_FILE_MB} MB)`);
        continue;
      }
      setAdding((n) => n + 1);
      const entry = await mindmap.addFile(node.id, f);
      setAdding((n) => n - 1);
      if (entry) toast.success(`'${f.name}' eklendi`);
      else toast.error(`'${f.name}' kaydedilemedi — depolama dolu olabilir`);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5" />
        Dosyalar {files.length > 0 && `(${files.length})`}
        {adding > 0 && <Loader2 className="h-3 w-3 animate-spin" />}
        <button
          onClick={() => inputRef.current?.click()}
          className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-foreground hover:bg-muted/70"
        >
          + Ekle
        </button>
      </div>

      {files.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {files.map((f) => (
            <FileRow key={f.id} nodeId={node.id} file={f} />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50",
          dragOver && "border-primary bg-primary/10 text-primary",
        )}
      >
        <Paperclip className="h-4 w-4" />
        {dragOver ? "Bırakınca eklenecek" : "PDF veya dosya ekle / sürükle"}
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip,audio/*,video/*,application/*,text/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
