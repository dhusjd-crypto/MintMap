import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Send, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { aiChatStep, type AIToolCall } from "@/lib/ai.functions";
import { mindmap, useNodes, type Todo } from "@/lib/mindmap-store";

type ToolMsg = { role: "tool"; tool_call_id: string; content: string };
type AsstMsg = {
  role: "assistant";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
};
type UserMsg = { role: "user"; content: string };
type ChatMsg = UserMsg | AsstMsg | ToolMsg;

type UIToolActivity = { id: string; name: string; ok: boolean; summary: string };
type UIBubble =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; tools?: UIToolActivity[] };

const STORAGE_KEY = "mindgrove.aichat.v2";
const MAX_STEPS = 6;

function loadHistory(): { msgs: ChatMsg[]; bubbles: UIBubble[] } {
  if (typeof window === "undefined") return { msgs: [], bubbles: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { msgs: ChatMsg[]; bubbles: UIBubble[] };
  } catch {
    /* noop */
  }
  return { msgs: [], bubbles: [] };
}

function parseArgs(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toTs(iso?: unknown): number | undefined {
  if (typeof iso !== "string" || !iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

export function AIChat({
  open,
  onClose,
  initialPrompt,
  autoSend,
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  autoSend?: boolean;
}) {
  const nodes = useNodes();
  const initial = useMemo(loadHistory, []);
  const [msgs, setMsgs] = useState<ChatMsg[]>(initial.msgs);
  const [bubbles, setBubbles] = useState<UIBubble[]>(initial.bubbles);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const step = useServerFn(aiChatStep);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ msgs: msgs.slice(-30), bubbles: bubbles.slice(-30) }),
      );
    }
  }, [msgs, bubbles]);

  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [bubbles, busy, open]);

  // Compact workspace context with IDs so the AI can reference real nodes/tasks.
  const context = useMemo(() => {
    const lines: string[] = ["Düğümler (id · başlık · [üst]):"];
    const root = nodes.find((n) => !n.parentId);
    if (root) lines.push(`ROOT: ${root.id}`);
    nodes.slice(0, 30).forEach((n) => {
      lines.push(`- ${n.id} · ${n.title}${n.parentId ? ` · [${n.parentId}]` : " · [root]"}${n.tags?.length ? ` #${n.tags.join(" #")}` : ""}`);
      const open = n.todos.filter((t) => !t.done).slice(0, 5);
      open.forEach((t) => lines.push(`    · task ${t.id} · ${t.text}${t.dueAt ? ` (due ${new Date(t.dueAt).toISOString().slice(0, 16)})` : ""}`));
    });
    return lines.join("\n");
  }, [nodes]);

  // Execute one tool call against the store. Returns a short summary.
  const execTool = (name: string, argsStr: string): { ok: boolean; summary: string; result: unknown } => {
    const args = parseArgs(argsStr);
    try {
      if (name === "create_node") {
        const title = String(args.title ?? "").trim();
        if (!title) throw new Error("title boş");
        let parentId = typeof args.parentId === "string" ? args.parentId : "";
        if (!parentId || !nodes.some((n) => n.id === parentId)) {
          parentId = nodes.find((n) => !n.parentId)?.id ?? nodes[0]?.id ?? "";
        }
        if (!parentId) throw new Error("workspace boş");
        const node = mindmap.add(parentId, title);
        const tags = Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : undefined;
        if (tags?.length) mindmap.update(node.id, { tags });
        return { ok: true, summary: `Düğüm: "${title}"`, result: { id: node.id, title } };
      }
      if (name === "create_task") {
        const nodeId = String(args.nodeId ?? "");
        const text = String(args.text ?? "").trim();
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) throw new Error("nodeId bulunamadı");
        if (!text) throw new Error("text boş");
        const extra: Partial<Todo> = {};
        const due = toTs(args.dueAtISO);
        const rem = toTs(args.reminderAtISO);
        if (due) extra.dueAt = due;
        if (rem) extra.reminderAt = rem;
        if (args.starred) extra.starred = true;
        if (args.myDay) {
          extra.myDay = true;
          extra.myDayAt = Date.now();
        }
        const tags = Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : undefined;
        if (tags?.length) extra.tags = tags;
        mindmap.addTodo(nodeId, text, null, extra);
        // The store generates the id internally; find it back as the last task.
        const newTask = mindmap.workspace.current()?.nodes.find((n) => n.id === nodeId)?.todos.at(-1);
        const steps = Array.isArray(args.steps) ? (args.steps as unknown[]).map(String).filter(Boolean) : [];
        if (newTask && steps.length) steps.forEach((s) => mindmap.addStep(nodeId, newTask.id, s));
        return {
          ok: true,
          summary: `Görev: "${text}" → ${node.title}${steps.length ? ` (+${steps.length} adım)` : ""}`,
          result: { id: newTask?.id, nodeId },
        };
      }
      if (name === "add_subtasks") {
        const nodeId = String(args.nodeId ?? "");
        const taskId = String(args.taskId ?? "");
        const steps = Array.isArray(args.steps) ? (args.steps as unknown[]).map(String).filter(Boolean) : [];
        if (!steps.length) throw new Error("steps boş");
        steps.forEach((s) => mindmap.addStep(nodeId, taskId, s));
        return { ok: true, summary: `${steps.length} alt adım eklendi`, result: { count: steps.length } };
      }
      if (name === "update_task") {
        const nodeId = String(args.nodeId ?? "");
        const taskId = String(args.taskId ?? "");
        const patch: Partial<Todo> = {};
        const due = toTs(args.dueAtISO);
        const rem = toTs(args.reminderAtISO);
        if (due) patch.dueAt = due;
        if (rem) patch.reminderAt = rem;
        if (typeof args.starred === "boolean") patch.starred = args.starred;
        if (typeof args.done === "boolean") patch.done = args.done;
        if (typeof args.myDay === "boolean") {
          patch.myDay = args.myDay;
          if (args.myDay) patch.myDayAt = Date.now();
        }
        const tags = Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : undefined;
        if (tags) patch.tags = tags;
        mindmap.updateTodo(nodeId, taskId, patch);
        return { ok: true, summary: `Görev güncellendi`, result: { ok: true } };
      }
      throw new Error(`Bilinmeyen araç: ${name}`);
    } catch (e) {
      return { ok: false, summary: (e as Error).message, result: { error: (e as Error).message } };
    }
  };

  const sendText = async (text: string) => {
    text = text.trim();
    if (!text || busy) return;
    setInput("");
    const newMsgs: ChatMsg[] = [...msgs, { role: "user", content: text }];
    setMsgs(newMsgs);
    setBubbles((b) => [...b, { kind: "user", text }]);
    setBusy(true);

    try {
      let cur: ChatMsg[] = newMsgs;
      for (let i = 0; i < MAX_STEPS; i++) {
        const provider = (typeof window !== "undefined" ? localStorage.getItem("mintmap.ai.provider") : null) as "openai" | "gateway" | null;
        const model = typeof window !== "undefined" ? localStorage.getItem("mintmap.ai.model") || undefined : undefined;
        const res = await step({ data: { messages: cur, context, provider: provider ?? undefined, model } });
        const asst: AsstMsg = {
          role: "assistant",
          content: res.content || null,
          tool_calls: res.toolCalls.length
            ? res.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              }))
            : undefined,
        };
        cur = [...cur, asst];

        if (!res.toolCalls.length) {
          // Final assistant message — just text
          setMsgs(cur);
          setBubbles((b) => [...b, { kind: "assistant", text: res.content || "(yanıt yok)" }]);
          break;
        }

        // Execute tools, append tool messages, log activity bubble.
        const activity: UIToolActivity[] = [];
        const toolMsgs: ToolMsg[] = [];
        for (const tc of res.toolCalls as AIToolCall[]) {
          const out = execTool(tc.name, tc.arguments);
          activity.push({ id: tc.id, name: tc.name, ok: out.ok, summary: out.summary });
          toolMsgs.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(out.result),
          });
        }
        cur = [...cur, ...toolMsgs];
        setMsgs(cur);
        setBubbles((b) => [
          ...b,
          { kind: "assistant", text: res.content || "", tools: activity },
        ]);

        if (i === MAX_STEPS - 1) {
          setBubbles((b) => [
            ...b,
            { kind: "assistant", text: "(maksimum araç adımına ulaşıldı)" },
          ]);
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = () => sendText(input);

  // Auto-send initial prompt when opened with one
  const lastAutoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !initialPrompt || !autoSend) return;
    if (lastAutoRef.current === initialPrompt) return;
    lastAutoRef.current = initialPrompt;
    sendText(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, autoSend]);



  const suggestions = [
    "Hafta sonu için seyahat planı düğümü oluştur; içine 4 görev ekle.",
    "Bugün Günüm'e 'Spor 30 dk' görevini ekle, 18:00 hatırlat.",
    "Mevcut 'Proje fikri' düğümüne 3 alt görev ve adımlarını ekle.",
  ];

  const reset = () => {
    setMsgs([]);
    setBubbles([]);
    toast.success("Sohbet temizlendi");
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
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[88svh] flex-col overflow-hidden rounded-t-3xl bg-card shadow-leaf"
          >
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-border" />
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-display text-base font-bold">AI yardımcı</span>
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                araç destekli
              </span>
              <button
                onClick={reset}
                aria-label="Sohbeti temizle"
                className="ml-auto p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button onClick={onClose} aria-label="Kapat" className="p-1.5">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {bubbles.length === 0 && (
                <div className="space-y-3 py-4">
                  <p className="text-center text-sm text-muted-foreground">
                    Sohbet et — AI gerektiğinde düğüm ve görev oluşturup mindmap'ine ekler.
                  </p>
                  <div className="space-y-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="block w-full rounded-xl bg-muted/50 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {bubbles.map((b, i) =>
                b.kind === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {b.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[90%] space-y-1.5">
                      {b.text && (
                        <div className="whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">
                          {b.text}
                        </div>
                      )}
                      {b.tools?.map((t) => (
                        <div
                          key={t.id}
                          className={`flex items-start gap-2 rounded-xl border px-2.5 py-1.5 text-[12px] ${
                            t.ok
                              ? "border-primary/20 bg-primary/5 text-foreground"
                              : "border-destructive/30 bg-destructive/5 text-destructive"
                          }`}
                        >
                          {t.ok ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>
                            <span className="font-mono font-semibold">{t.name}</span> · {t.summary}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 animate-spin" /> düşünüyor…
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border px-3 py-2.5">
              <div className="flex items-end gap-2 rounded-2xl bg-muted/50 px-3 py-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder="AI'ya sor veya bir şey oluşturmasını iste..."
                  className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none"
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || busy}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                  aria-label="Gönder"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
