import { Suspense, useEffect, useRef, useState } from "react";
import { FormPanel } from "@/components/FormPanel";
import {
  Bell,
  CalendarPlus,
  Check,
  CornerDownRight,
  Eye,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownNote } from "@/components/MarkdownNote";
import { LazyNodeImagePanel as NodeImagePanel } from "@/components/LazyNodeImagePanel";
import { NodeFilePanel } from "@/components/NodeFilePanel";
import { TagEditor } from "@/components/TagEditor";
import type { MindNode, Todo } from "@/lib/mindmap-store";
import {
  mindmap,
  requestNotificationPermission,
  useNode,
} from "@/lib/mindmap-store";
import { NODE_TYPES, NODE_TYPE_ORDER, nodeTypeOf } from "@/lib/node-types";
import { calendarCreateEvent } from "@/lib/google/calendar";
import { aiSuggestSubnodes, aiSummarize, aiBreakdownTask, aiAutoTag } from "@/lib/ai.functions";

const REMINDER_PRESETS = [
  { l: "5 dk", m: 5 },
  { l: "30 dk", m: 30 },
  { l: "1 saat", m: 60 },
];

const NODE_COLORS = [
  "oklch(0.85 0.06 145)",
  "oklch(0.88 0.07 95)",
  "oklch(0.86 0.06 60)",
  "oklch(0.85 0.06 25)",
  "oklch(0.84 0.05 320)",
  "oklch(0.85 0.05 220)",
];


type Props = {
  nodeId: string | null;
  onClose: () => void;
  initialTab?: "note" | "todo" | "extra";
};

function safeShareFileName(title: string) {
  const clean = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return clean || "mintmap-gorsel";
}

function extensionForMime(type: string) {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

function mimeForFile(file: File) {
  if (file.type) return file.type;
  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  if (/\.gif$/i.test(file.name)) return "image/gif";
  if (/\.(jpe?g|jfif)$/i.test(file.name)) return "image/jpeg";
  return "application/octet-stream";
}

function normalizeShareFile(file: File) {
  const type = mimeForFile(file);
  if (file.type === type) return file;
  const name = file.name || `mintmap-dosya.${extensionForMime(type)}`;
  return new File([file], name, { type, lastModified: file.lastModified });
}

async function imageSrcToShareFile(src: string, title: string): Promise<File | null> {
  const base = safeShareFileName(title);
  if (src.startsWith("data:")) {
    const [header, data = ""] = src.split(",", 2);
    const type = header.match(/^data:([^;,]+)/)?.[1] || "image/jpeg";
    const raw = header.includes(";base64") ? atob(data) : decodeURIComponent(data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return new File([bytes], `${base}.${extensionForMime(type)}`, { type });
  }

  const res = await fetch(src);
  if (!res.ok) return null;
  const blob = await res.blob();
  const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  return new File([blob], `${base}.${extensionForMime(type)}`, { type });
}

async function selectedNodeImageFile(node: MindNode): Promise<File | null> {
  const active =
    node.images?.find((image) => image.id === node.activeImageId) ??
    node.images?.[0] ??
    null;
  const src = active?.src ?? node.image;
  if (!src) return null;
  return imageSrcToShareFile(src, node.title);
}

export function NodeSheet({ nodeId, onClose, initialTab = "note" }: Props) {
  const liveNode = useNode(nodeId);
  // Retain the last node while the panel animates closed so its content stays
  // rendered through the exit window (FormPanel owns the mount lifecycle).
  const lastNodeRef = useRef(liveNode);
  if (liveNode) lastNodeRef.current = liveNode;
  const node = liveNode ?? lastNodeRef.current;
  const open = !!liveNode;
  const retryFileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState(initialTab);
  const [todoText, setTodoText] = useState("");
  const [subParentId, setSubParentId] = useState<string | null>(null);
  const [subText, setSubText] = useState("");
  
  const [notePreview, setNotePreview] = useState(false);
  const [aiBusy, setAiBusy] = useState<"sub" | "sum" | "todos" | "tags" | null>(null);

  const suggestSub = useServerFn(aiSuggestSubnodes);
  const summarize = useServerFn(aiSummarize);
  const breakdown = useServerFn(aiBreakdownTask);
  const autoTag = useServerFn(aiAutoTag);

  const runAutoTag = async () => {
    if (!node) return;
    setAiBusy("tags");
    const t = toast.loading("AI etiket öneriyor...");
    try {
      const res = await autoTag({
        data: { text: node.title, note: node.note, existing: node.tags ?? [] },
      });
      if (!res.items.length) toast.message("Yeni etiket bulunamadı", { id: t });
      else {
        mindmap.update(node.id, { tags: [...(node.tags ?? []), ...res.items] });
        toast.success(`${res.items.length} etiket eklendi`, { id: t });
      }
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setAiBusy(null);
    }
  };

  const runSuggestSub = async () => {
    if (!node) return;
    setAiBusy("sub");
    const t = toast.loading("AI alt fikirler üretiyor...");
    try {
      const res = await suggestSub({ data: { title: node.title, note: node.note } });
      res.items.forEach((title) => mindmap.add(node.id, title));
      toast.success(`${res.items.length} alt fikir eklendi`, { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setAiBusy(null);
    }
  };

  const runSummarize = async () => {
    if (!node || !(node.note ?? "").trim()) {
      toast.error("Önce nota bir şey yaz");
      return;
    }
    setAiBusy("sum");
    const t = toast.loading("AI özetliyor...");
    try {
      const res = await summarize({ data: { title: node.title, note: node.note } });
      mindmap.update(node.id, {
        note: `${node.note.trim()}\n\n---\n**Özet**\n${res.summary}`,
      });
      setNotePreview(true);
      toast.success("Özet eklendi", { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setAiBusy(null);
    }
  };

  const runBreakdown = async () => {
    if (!node) return;
    setAiBusy("todos");
    const t = toast.loading("AI görevlere bölüyor...");
    try {
      const res = await breakdown({ data: { text: node.title, context: node.note } });
      res.items.forEach((text) => mindmap.addTodo(node.id, text));
      toast.success(`${res.items.length} görev eklendi`, { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setAiBusy(null);
    }
  };

  useEffect(() => {
    if (nodeId) setTab(initialTab);
  }, [nodeId, initialTab]);

  const buildShareText = (target: MindNode) => {
    const todos = target.todos.map((t) => `${t.done ? "✅" : "⬜️"} ${t.text}`).join("\n");
    return [target.title, target.note, todos].filter(Boolean).join("\n\n");
  };

  const shareFiles = async (files: File[], label = "Dosya") => {
    if (!node || !files.length || typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return false;
    }
    const text = buildShareText(node);
    const normalized = files.map(normalizeShareFile);
    const canSharePayload = (payload: ShareData) =>
      typeof navigator.canShare !== "function" || navigator.canShare(payload);
    const candidates: ShareData[] = [
      { title: node.title, text, files: normalized },
      { title: node.title, files: normalized },
    ];
    const payload = candidates.find(canSharePayload);
    if (!payload) {
      toast.error(`${label} bu tarayıcıda paylaşılabilir formatta değil`);
      return false;
    }
    try {
      await navigator.share(payload);
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
      toast.error(`${label} ile paylaşım yeniden başarısız oldu`);
      return false;
    }
  };

  const share = async () => {
    if (!node) return;
    const text = buildShareText(node);
    const textPayload: ShareData = { title: node.title, text };
    let selectedFile: File | null = null;
    try {
      selectedFile = await selectedNodeImageFile(node);
    } catch {
      selectedFile = null;
    }

    const hasNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function";
    const canSharePayload = (payload: ShareData) =>
      hasNativeShare &&
      (typeof navigator.canShare !== "function" || navigator.canShare(payload));
    const filePayloads: ShareData[] = selectedFile
      ? [
          { title: node.title, text, files: [selectedFile] },
          { title: node.title, files: [selectedFile] },
        ]
      : [];
    const filePayload = filePayloads.find(canSharePayload) ?? null;
    const primaryPayload = filePayload ?? textPayload;
    const canUseShare = canSharePayload(primaryPayload);

    const retryWithFile = async () => {
      if (selectedFile) {
        await shareFiles([selectedFile], "Seçili görsel");
        return;
      }
      retryFileInputRef.current?.click();
    };

    if (canUseShare) {
      try {
        await navigator.share(primaryPayload);
        return;
      } catch (err) {
        // User dismissed — stay silent.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Otherwise fall through to clipboard so the action is never a no-op.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(selectedFile ? "Metin panoya kopyalandı" : "Panoya kopyalandı", {
        action: hasNativeShare
          ? { label: selectedFile ? "Dosyayla yeniden dene" : "Dosya seç", onClick: () => void retryWithFile() }
          : undefined,
      });
    } catch {
      toast.error("Paylaşım başarısız. Tarayıcın izin vermiyor olabilir.");
    }
  };


  const setReminder = (minutes: number) => {
    if (!node) return;
    requestNotificationPermission();
    mindmap.update(node.id, { reminderAt: Date.now() + minutes * 60_000 });
    toast.success(`${minutes} dk sonra hatırlatacağım`);
  };

  const addToCalendar = calendarCreateEvent;
  const handleAddToCalendar = async () => {
    if (!node) return;
    const start = node.reminderAt ? new Date(node.reminderAt) : new Date(Date.now() + 60 * 60_000);
    const end = new Date(start.getTime() + 30 * 60_000);
    const t = toast.loading("Google Takvim'e ekleniyor...");
    try {
      const res = await addToCalendar({
        data: {
          title: node.title,
          description: node.note,
          startISO: start.toISOString(),
          endISO: end.toISOString(),
        },
      });
      toast.success("Takvime eklendi", {
        id: t,
        action: res.htmlLink
          ? { label: "Aç", onClick: () => window.open(res.htmlLink!, "_blank") }
          : undefined,
      });
    } catch (e) {
      toast.error("Takvim hatası: " + (e as Error).message, { id: t });
    }
  };

  return (
    <>
      {node && (
        <FormPanel
          open={open}
          onClose={onClose}
          ariaLabel={node.title || "Düğüm"}
          description="Düğümü düzenle — değişiklikler anında kaydedilir"
          icon={
            <span
              className="block h-3 w-3 rounded-full"
              style={{ background: node.color }}
            />
          }
          title={
            <Input
              value={node.title}
              onChange={(e) => mindmap.update(node.id, { title: e.target.value })}
              aria-label="Düğüm başlığı"
              className="border-0 bg-transparent px-0 font-display text-xl font-bold shadow-none focus-visible:ring-0"
            />
          }
        >
          <input
            ref={retryFileInputRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              void shareFiles(files, files.length > 1 ? "Seçili dosyalar" : "Seçili dosya");
            }}
          />
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="grid w-full grid-cols-3 bg-muted">
                <TabsTrigger value="note">Not</TabsTrigger>
                <TabsTrigger value="todo">
                  Görevler {node.todos.length > 0 && `(${node.todos.length})`}
                </TabsTrigger>
                <TabsTrigger value="extra">Ekstra</TabsTrigger>
              </TabsList>

              <TabsContent value="note" className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Markdown destekli
                  </p>
                  <button
                    onClick={() => setNotePreview((v) => !v)}
                    className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold"
                  >
                    {notePreview ? (
                      <>
                        <Pencil className="h-3 w-3" /> Düzenle
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" /> Önizle
                      </>
                    )}
                  </button>
                </div>
                {notePreview ? (
                  <div className="min-h-[140px] rounded-md bg-muted/50 p-3">
                    <MarkdownNote source={node.note} />
                  </div>
                ) : (
                  <Textarea
                    value={node.note}
                    onChange={(e) => mindmap.update(node.id, { note: e.target.value })}
                    placeholder="**Markdown** destekli not yaz..."
                    className="min-h-[140px] resize-none bg-muted/50 font-mono text-[13px]"
                  />
                )}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Etiketler
                    </span>
                    <button
                      onClick={runAutoTag}
                      disabled={aiBusy === "tags"}
                      className="flex items-center gap-1 text-[11px] font-semibold text-primary disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      {aiBusy === "tags" ? "..." : "AI öner"}
                    </button>
                  </div>
                  <TagEditor
                    tags={node.tags ?? []}
                    onChange={(tags) => mindmap.update(node.id, { tags })}
                    placeholder="Dal etiketi ekle"
                  />
                </div>
                <div className="sticky bottom-0 z-20 -mx-1 rounded-2xl bg-background/80 px-1 pb-1 pt-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
                  <Suspense fallback={<div className="h-24 rounded-xl bg-muted/50 animate-pulse" />}>
                    <NodeImagePanel node={node} />
                  </Suspense>
                </div>
                <NodeFilePanel node={node} />
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={aiBusy !== null}
                  onClick={runSummarize}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-primary" />
                  {aiBusy === "sum" ? "Özetleniyor..." : "AI ile notu özetle"}
                </Button>
              </TabsContent>


              <TabsContent value="todo" className="mt-4 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={todoText}
                    onChange={(e) => setTodoText(e.target.value)}
                    placeholder="Alt görev ekle..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && todoText.trim()) {
                        mindmap.addTodo(node.id, todoText.trim());
                        setTodoText("");
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={() => {
                      if (!todoText.trim()) return;
                      mindmap.addTodo(node.id, todoText.trim());
                      setTodoText("");
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={aiBusy !== null}
                  onClick={runBreakdown}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-primary" />
                  {aiBusy === "todos" ? "Bölünüyor..." : "AI ile görevlere böl"}
                </Button>
                <div className="max-h-[40vh] space-y-1.5 overflow-y-auto">
                  {node.todos.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Henüz görev yok
                    </p>
                  )}
                  {(() => {
                    const renderTodo = (t: Todo, depth: number) => {
                      const children = node.todos.filter((x) => x.parentId === t.id);
                      const isActive = subParentId === t.id;
                      return (
                        <div key={t.id}>
                          <div
                            className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5"
                            style={{ marginLeft: depth * 20 }}
                          >
                            <button
                              onClick={() => mindmap.toggleTodo(node.id, t.id)}
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                                t.done
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border"
                              }`}
                            >
                              {t.done && <Check className="h-3 w-3" />}
                            </button>
                            <span
                              className={`flex-1 text-sm ${t.done ? "text-muted-foreground line-through" : ""}`}
                            >
                              {t.text}
                            </span>
                            <button
                              onClick={() => {
                                setSubParentId(isActive ? null : t.id);
                                setSubText("");
                              }}
                              className={`shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                              aria-label="Alt görev"
                              title="Alt görev ekle"
                            >
                              <CornerDownRight className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => mindmap.removeTodo(node.id, t.id)}
                              className="text-muted-foreground"
                              aria-label="Sil"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {isActive && (
                            <div
                              className="mt-1.5 flex gap-2"
                              style={{ marginLeft: (depth + 1) * 20 }}
                            >
                              <Input
                                autoFocus
                                value={subText}
                                onChange={(e) => setSubText(e.target.value)}
                                placeholder="Alt görev..."
                                className="h-9"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && subText.trim()) {
                                    mindmap.addTodo(node.id, subText.trim(), t.id);
                                    setSubText("");
                                  }
                                  if (e.key === "Escape") setSubParentId(null);
                                }}
                              />
                              <Button
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => {
                                  if (!subText.trim()) return;
                                  mindmap.addTodo(node.id, subText.trim(), t.id);
                                  setSubText("");
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                          {children.length > 0 && (
                            <div className="mt-1.5 space-y-1.5">
                              {children.map((c) => renderTodo(c, depth + 1))}
                            </div>
                          )}
                        </div>
                      );
                    };
                    return node.todos
                      .filter((t) => !t.parentId)
                      .map((t) => renderTodo(t, 0));
                  })()}
                </div>
              </TabsContent>


              <TabsContent value="extra" className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold">Tür</p>
                  <div className="flex flex-wrap gap-1.5">
                    {NODE_TYPE_ORDER.map((t) => {
                      const meta = NODE_TYPES[t];
                      const Icon = meta.icon;
                      const active = nodeTypeOf(node) === t;
                      return (
                        <button
                          key={t}
                          onClick={() => mindmap.update(node.id, { type: t })}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold">
                    <Bell className="mr-1 inline h-4 w-4" /> Hatırlatıcı
                  </p>
                  {node.reminderAt && node.reminderAt > Date.now() ? (
                    <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
                      <span>
                        {new Date(node.reminderAt).toLocaleString("tr-TR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      <button
                        onClick={() =>
                          mindmap.update(node.id, { reminderAt: undefined })
                        }
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { l: "5 dk", m: 5 },
                        { l: "30 dk", m: 30 },
                        { l: "1 saat", m: 60 },
                      ].map((o) => (
                        <Button
                          key={o.m}
                          variant="outline"
                          size="sm"
                          onClick={() => setReminder(o.m)}
                        >
                          {o.l}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold">Renk</p>
                  <div className="flex flex-wrap gap-2">
                    {NODE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => mindmap.update(node.id, { color: c })}
                        className={`h-8 w-8 rounded-full border-2 transition-transform ${
                          node.color === c
                            ? "scale-110 border-primary"
                            : "border-transparent"
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  disabled={aiBusy !== null}
                  onClick={runSuggestSub}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-primary" />
                  {aiBusy === "sub" ? "Üretiliyor..." : "AI ile alt fikirler öner"}
                </Button>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={handleAddToCalendar}>
                    <CalendarPlus className="mr-2 h-4 w-4" /> Takvime ekle
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={share}>
                    <Share2 className="mr-2 h-4 w-4" /> Paylaş
                  </Button>
                </div>
                {node.parentId && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => {
                      mindmap.remove(node.id);
                      onClose();
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Sil
                  </Button>
                )}
              </TabsContent>
            </Tabs>
        </FormPanel>
      )}
    </>
  );
}
