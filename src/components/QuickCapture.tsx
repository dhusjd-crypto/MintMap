import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic, MicOff, Sparkles, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { aiQuickCapture } from "@/lib/ai.functions";
import { mindmap, useNodes } from "@/lib/mindmap-store";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognizer(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "tr-TR";
  rec.continuous = false;
  rec.interimResults = true;
  return rec;
}

export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nodes = useNodes();
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported =
    typeof window !== "undefined" &&
    !!(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );
  const capture = useServerFn(aiQuickCapture);

  useEffect(() => {
    if (!open) {
      setText("");
      stopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startRecording = () => {
    const rec = getRecognizer();
    if (!rec) {
      toast.error("Bu tarayıcı sesli yakalamayı desteklemiyor");
      return;
    }
    recRef.current = rec;
    rec.onresult = (ev) => {
      let acc = "";
      for (let i = 0; i < ev.results.length; i++) {
        acc += ev.results[i][0].transcript;
      }
      setText(acc);
    };
    rec.onerror = (e) => {
      toast.error(`Mikrofon: ${e.error}`);
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    rec.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* noop */
      }
      recRef.current = null;
    }
    setRecording(false);
  };

  const rootNode = nodes.find((n) => !n.parentId) ?? nodes[0];

  const run = async () => {
    const raw = text.trim();
    if (!raw || busy) return;
    stopRecording();
    setBusy(true);
    const t = toast.loading("AI işliyor...");
    try {
      const res = await capture({ data: { text: raw } });
      if (!rootNode) throw new Error("Workspace boş");
      const node = mindmap.add(rootNode.id, res.title);
      const patch: Partial<typeof node> = {};
      if (res.summary) patch.note = res.summary;
      if (res.tags.length) patch.tags = res.tags;
      if (Object.keys(patch).length) mindmap.update(node.id, patch);
      res.todos.forEach((t2) => mindmap.addTodo(node.id, t2));
      toast.success(`"${res.title}" eklendi · ${res.todos.length} görev`, { id: t });
      setText("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-bark/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            className="fixed inset-x-3 top-20 z-50 overflow-hidden rounded-3xl bg-card p-4 shadow-leaf"
          >
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-display font-bold">Hızlı yakala</span>
              <button onClick={onClose} aria-label="Kapat" className="ml-auto p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Aklındaki fikri yaz veya söyle — AI başlık, etiket ve görevlere çevirsin.
            </p>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Örn. yeni blog için içerik fikirleri toplamam lazım, haftada 2 paylaşım..."
              className="w-full resize-none rounded-2xl bg-muted/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="mt-3 flex items-center gap-2">
              {speechSupported && (
                <button
                  onClick={() => (recording ? stopRecording() : startRecording())}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    recording
                      ? "bg-destructive text-destructive-foreground animate-pulse"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {recording ? "Durdur" : "Sesle"}
                </button>
              )}
              <span className="text-[11px] text-muted-foreground">
                {rootNode ? `→ ${rootNode.title}` : ""}
              </span>
              <button
                onClick={run}
                disabled={!text.trim() || busy}
                className="ml-auto flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI ile ekle
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
