import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useOverlayPresence } from "@/lib/use-overlay-presence";
import { Mic, Square, Loader2, Send, X, Trash2, CheckCircle2, Bell, Calendar, Star, Sun, Plus, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { aiTranscribe, aiExtractVoiceTask } from "@/lib/ai.functions";
import { mindmap, useNodes } from "@/lib/mindmap-store";

type Status = "idle" | "recording" | "transcribing" | "extracting" | "preview";

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ISO ↔ "YYYY-MM-DDTHH:mm" local
function isoToLocal(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}
function fmtWhen(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Draft = {
  text: string;
  reminderLocal: string;
  dueLocal: string;
  nodeId: string;
  newNodeTitle: string;
  tags: string[];
  steps: string[];
  starred: boolean;
  myDay: boolean;
};

export function VoiceCapture({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const mounted = useOverlayPresence(open);
  const nodes = useNodes();
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);

  const transcribe = useServerFn(aiTranscribe);
  const extract = useServerFn(aiExtractVoiceTask);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rootId = useMemo(() => nodes.find((n) => !n.parentId)?.id ?? nodes[0]?.id ?? "", [nodes]);

  useEffect(() => {
    if (!open) {
      stopAll();
      setStatus("idle");
      setTranscript("");
      setDraft(null);
      setElapsed(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopAll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recRef.current && recRef.current.state !== "inactive") {
      try { recRef.current.stop(); } catch { /* noop */ }
    }
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const buildPreview = async (text: string) => {
    setStatus("extracting");
    try {
      const provider = (typeof window !== "undefined" ? localStorage.getItem("mintmap.ai.provider") : null) as
        | "openai"
        | "gateway"
        | null;
      const model = typeof window !== "undefined" ? localStorage.getItem("mintmap.ai.model") || undefined : undefined;
      const res = await extract({
        data: {
          transcript: text,
          now: new Date().toISOString(),
          nodes: nodes.slice(0, 30).map((n) => ({ id: n.id, title: n.title, tags: n.tags })),
          provider: provider ?? undefined,
          model,
        },
      });
      setDraft({
        text: res.text || text,
        reminderLocal: isoToLocal(res.reminderAtISO),
        dueLocal: isoToLocal(res.dueAtISO),
        nodeId: res.nodeId || "",
        newNodeTitle: res.nodeId ? "" : (res.suggestedNodeTitle || ""),
        tags: res.tags,
        steps: res.steps,
        starred: res.starred,
        myDay: res.myDay,
      });
      setStatus("preview");
    } catch (e) {
      toast.error((e as Error).message);
      // Fallback: still let user confirm raw text
      setDraft({
        text,
        reminderLocal: "",
        dueLocal: "",
        nodeId: "",
        newNodeTitle: "",
        tags: [],
        steps: [],
        starred: false,
        myDay: true,
      });
      setStatus("preview");
    }
  };

  const start = async () => {
    const mime = pickMime();
    if (!mime) {
      toast.error("Tarayıcı ses kaydını desteklemiyor");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size < 1024) {
          toast.error("Kayıt çok kısa — tekrar dene");
          setStatus("idle");
          setElapsed(0);
          return;
        }
        setStatus("transcribing");
        try {
          const b64 = await blobToBase64(blob);
          const providerPref = (typeof window !== "undefined" ? localStorage.getItem("mintmap.ai.provider") : null) as
            | "openai"
            | "gateway"
            | null;
          const res = await transcribe({ data: { audio: b64, mime, language: "tr", provider: providerPref ?? undefined } });
          if (!res.text) {
            toast.error("Konuşma algılanamadı");
            setStatus("idle");
            return;
          }
          setTranscript(res.text);
          await buildPreview(res.text);
        } catch (e) {
          toast.error((e as Error).message);
          setStatus("idle");
        }
      };
      rec.start();
      recRef.current = rec;
      setStatus("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      toast.error("Mikrofon izni gerekli");
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recRef.current?.stop();
  };

  const confirmAdd = () => {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) {
      toast.error("Görev metni boş");
      return;
    }
    let nodeId = draft.nodeId;
    if (!nodeId) {
      const title = draft.newNodeTitle.trim() || "Sesli notlar";
      const parent = rootId;
      if (!parent) {
        toast.error("Çalışma alanı boş");
        return;
      }
      const node = mindmap.add(parent, title);
      nodeId = node.id;
    }
    const reminderAt = draft.reminderLocal ? new Date(draft.reminderLocal).getTime() : undefined;
    const dueAt = draft.dueLocal ? new Date(draft.dueLocal).getTime() : undefined;
    mindmap.addTodo(nodeId, text, null, {
      ...(reminderAt ? { reminderAt } : {}),
      ...(dueAt ? { dueAt } : {}),
      ...(draft.starred ? { starred: true } : {}),
      ...(draft.myDay ? { myDay: true, myDayAt: Date.now() } : {}),
      ...(draft.tags.length ? { tags: draft.tags } : {}),
    });
    const newTask = mindmap.workspace.current()?.nodes.find((n) => n.id === nodeId)?.todos.at(-1);
    if (newTask && draft.steps.length) {
      draft.steps.forEach((s) => mindmap.addStep(nodeId, newTask.id, s));
    }
    toast.success(
      reminderAt
        ? `Görev eklendi · ${fmtWhen(new Date(reminderAt).toISOString())} hatırlatma`
        : "Görev eklendi",
    );
    onClose();
  };

  const sendToAI = () => {
    if (!draft) return;
    const augmented =
      `Aşağıdaki sesli notumdan görevi/görevleri uygun düğüme ekle. ` +
      `Bugünün tarihi: ${new Date().toLocaleString("tr-TR")}.\n\nSesli not: "${draft.text.trim() || transcript}"`;
    onSubmit(augmented);
    onClose();
  };

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  const updateDraft = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  };
  const removeTag = (t: string) => updateDraft("tags", draft!.tags.filter((x) => x !== t));
  const removeStep = (i: number) => updateDraft("steps", draft!.steps.filter((_, idx) => idx !== i));

  return (
    <>
      {mounted && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{ pointerEvents: open ? "auto" : "none" }}
            className="fixed inset-0 z-40 bg-bark/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: open ? 0 : 40, opacity: open ? 1 : 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            style={{ pointerEvents: open ? "auto" : "none" }}
            className="fixed inset-x-4 bottom-24 z-50 mx-auto max-h-[80svh] max-w-md overflow-y-auto rounded-3xl bg-card p-5 shadow-leaf"
          >
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              <span className="font-display text-base font-bold">Sesli görev</span>
              <button onClick={onClose} aria-label="Kapat" className="ml-auto p-1.5">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center gap-3">
              {status === "idle" && (
                <>
                  <button
                    onClick={start}
                    aria-label="Kaydı başlat"
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-leaf transition-transform active:scale-95"
                  >
                    <Mic className="h-8 w-8" />
                  </button>
                  <p className="text-center text-sm text-muted-foreground">
                    Mikrofona basıp konuş. Örn: <span className="text-foreground">"Yarın 9'da spora gideceğim, hatırlat."</span>
                  </p>
                </>
              )}

              {status === "recording" && (
                <>
                  <button
                    onClick={stop}
                    aria-label="Kaydı durdur"
                    className="relative flex h-20 w-20 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-leaf"
                  >
                    <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />
                    <Square className="h-7 w-7" />
                  </button>
                  <p className="font-mono text-sm tabular-nums text-destructive">● {mmss} kaydediliyor…</p>
                </>
              )}

              {status === "transcribing" && (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Sesi yazıya çeviriyorum…</p>
                </>
              )}

              {status === "extracting" && (
                <>
                  <Sparkles className="h-10 w-10 animate-pulse text-primary" />
                  <p className="text-sm text-muted-foreground">Görevi çıkarıyorum…</p>
                  {transcript && (
                    <p className="line-clamp-2 text-center text-xs italic text-muted-foreground">"{transcript}"</p>
                  )}
                </>
              )}

              {status === "preview" && draft && (
                <div className="w-full space-y-3">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Önizleme — kaydetmeden onayla
                    </div>
                    {transcript && (
                      <p className="text-[11px] italic text-muted-foreground">"{transcript}"</p>
                    )}
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-semibold text-muted-foreground">Görev</span>
                    <textarea
                      value={draft.text}
                      onChange={(e) => updateDraft("text", e.target.value)}
                      rows={2}
                      className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        <Bell className="h-3 w-3" /> Hatırlatma
                      </span>
                      <input
                        type="datetime-local"
                        value={draft.reminderLocal}
                        onChange={(e) => updateDraft("reminderLocal", e.target.value)}
                        className="mt-1 w-full rounded-xl border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                      />
                    </label>
                    <label className="block">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        <Calendar className="h-3 w-3" /> Bitiş
                      </span>
                      <input
                        type="datetime-local"
                        value={draft.dueLocal}
                        onChange={(e) => updateDraft("dueLocal", e.target.value)}
                        className="mt-1 w-full rounded-xl border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-semibold text-muted-foreground">Kategori (düğüm)</span>
                    <select
                      value={draft.nodeId || "__new__"}
                      onChange={(e) =>
                        updateDraft("nodeId", e.target.value === "__new__" ? "" : e.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                    >
                      {nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                      <option value="__new__">+ Yeni düğüm oluştur…</option>
                    </select>
                    {!draft.nodeId && (
                      <input
                        value={draft.newNodeTitle}
                        onChange={(e) => updateDraft("newNodeTitle", e.target.value)}
                        placeholder="Yeni düğüm adı (örn. Sağlık, Spor)"
                        className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </label>

                  {draft.tags.length > 0 && (
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground">Etiketler</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {draft.tags.map((t) => (
                          <button
                            key={t}
                            onClick={() => removeTag(t)}
                            className="group flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] hover:bg-destructive/15 hover:text-destructive"
                          >
                            #{t}
                            <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {draft.steps.length > 0 && (
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground">Alt adımlar</span>
                      <ul className="mt-1 space-y-1">
                        {draft.steps.map((s, i) => (
                          <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1 text-xs">
                            <span className="flex-1">{s}</span>
                            <button
                              onClick={() => removeStep(i)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label="Adımı kaldır"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => updateDraft("starred", !draft.starred)}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-xs ${
                        draft.starred ? "border-amber-400 bg-amber-50 text-amber-700" : "border-input bg-background"
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${draft.starred ? "fill-current" : ""}`} /> Önemli
                    </button>
                    <button
                      onClick={() => updateDraft("myDay", !draft.myDay)}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-xs ${
                        draft.myDay ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"
                      }`}
                    >
                      <Sun className="h-3.5 w-3.5" /> Günüm
                    </button>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setDraft(null); setTranscript(""); setStatus("idle"); }}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-input bg-background px-3 py-2 text-sm hover:bg-muted"
                      aria-label="Vazgeç"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={sendToAI}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-input bg-background px-3 py-2 text-xs hover:bg-muted"
                    >
                      <Send className="h-3.5 w-3.5" /> AI'ya ilet
                    </button>
                    <button
                      onClick={confirmAdd}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Onayla ve ekle
                    </button>
                  </div>
                  <p className="text-center text-[10px] text-muted-foreground">
                    <Plus className="inline h-3 w-3" /> Hiçbir şey kaydedilmedi — onaylayana kadar değişiklik yapabilirsin.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </>
  );
}
