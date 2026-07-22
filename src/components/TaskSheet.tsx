import { Suspense, useEffect, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { FormPanel } from "@/components/FormPanel";
import {
  Bell,
  CalendarDays,
  Check,
  Flag,
  GripVertical,
  Link2,
  ListChecks,
  Plus,
  Repeat,
  Sparkles,
  Star,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { TagEditor } from "@/components/TagEditor";
import { mindmap, useNode, type Priority, type Recurrence, type Todo } from "@/lib/mindmap-store";
import { aiBreakdownTask, aiAutoTag } from "@/lib/ai.functions";
import { PRIORITY_META } from "@/lib/task-utils";

import { LazyNodeImagePanel as NodeImagePanel } from "@/components/LazyNodeImagePanel";

type Props = {
  nodeId: string | null;
  todoId: string | null;
  onClose: () => void;
};

function fmt(ts?: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function toLocalInput(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function TaskSheet({ nodeId, todoId, onClose }: Props) {
  const node = useNode(nodeId);
  const todo: Todo | undefined = node?.todos.find((t) => t.id === todoId);
  const [stepText, setStepText] = useState("");
  const [showDue, setShowDue] = useState(false);
  const [showRem, setShowRem] = useState(false);
  const [showRec, setShowRec] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const breakdown = useServerFn(aiBreakdownTask);
  const autoTag = useServerFn(aiAutoTag);

  useEffect(() => {
    setStepText("");
    setShowDue(false);
    setShowRem(false);
    setShowRec(false);
  }, [todoId]);

  if (!node || !todo) return null;

  const upd = (patch: Partial<Todo>) => mindmap.updateTodo(node.id, todo.id, patch);

  const runBreakdown = async () => {
    setAiBusy(true);
    const t = toast.loading("AI adımlara bölüyor...");
    try {
      const res = await breakdown({ data: { text: todo.text, context: node.title } });
      res.items.forEach((text) => mindmap.addStep(node.id, todo.id, text));
      toast.success(`${res.items.length} adım eklendi`, { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setAiBusy(false);
    }
  };

  const runAutoTag = async () => {
    setTagBusy(true);
    const t = toast.loading("AI etiket öneriyor...");
    try {
      const res = await autoTag({
        data: { text: todo.text, note: todo.note, existing: todo.tags ?? [] },
      });
      if (!res.items.length) {
        toast.message("Yeni etiket bulunamadı", { id: t });
      } else {
        upd({ tags: [...(todo.tags ?? []), ...res.items] });
        toast.success(`${res.items.length} etiket eklendi`, { id: t });
      }
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setTagBusy(false);
    }
  };

  return (
    <FormPanel
      open
      onClose={onClose}
      title="Görevi düzenle"
      description={node.title}
      icon={<ListChecks className="h-4 w-4" />}
      footerStart={
        <div className="flex flex-1 items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {todo.createdAt
              ? `${new Date(todo.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })} tarihinde oluşturuldu`
              : ""}
          </span>
          <button
            onClick={() => {
              // confirm() is blocked in installed PWAs — and the old message
              // lied: removeTodo goes through history, so it IS undoable.
              const text = todo.text;
              mindmap.removeTodo(node.id, todo.id);
              onClose();
              toast.success(`'${text}' silindi`, {
                action: { label: "Geri al", onClick: () => mindmap.undo() },
              });
            }}
            aria-label="Görevi sil"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      }
    >
        <div>
          {/* Title row */}
          <div className="flex items-start gap-3 py-2">
            <button
              onClick={() => mindmap.toggleTodo(node.id, todo.id)}
              className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                todo.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
              }`}
            >
              {todo.done && <Check className="h-3.5 w-3.5" />}
            </button>
            <Textarea
              value={todo.text}
              onChange={(e) => upd({ text: e.target.value })}
              rows={2}
              className={`min-h-0 resize-none border-0 bg-transparent p-0 text-lg font-semibold leading-snug shadow-none focus-visible:ring-0 ${
                todo.done ? "text-muted-foreground line-through" : ""
              }`}
            />
            <button
              onClick={() => upd({ starred: !todo.starred })}
              aria-label="Önemli"
              className="mt-1.5 shrink-0"
            >
              <Star
                className={`h-5 w-5 ${todo.starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
              />
            </button>
          </div>

          {/* Steps */}
          <div className="ml-9 space-y-1.5 pb-3">
            {(todo.steps?.length ?? 0) > 0 && (
              <Reorder.Group
                axis="y"
                values={todo.steps ?? []}
                onReorder={(next) => mindmap.reorderSteps(node.id, todo.id, next)}
                className="space-y-1.5"
              >
                {(todo.steps ?? []).map((s) => (
                  <StepItem
                    key={s.id}
                    step={s}
                    onToggle={() => mindmap.toggleStep(node.id, todo.id, s.id)}
                    onRemove={() => mindmap.removeStep(node.id, todo.id, s.id)}
                  />
                ))}
              </Reorder.Group>
            )}
            <div className="flex items-center gap-3 px-1 py-1">
              <button
                type="button"
                onClick={() => {
                  if (!stepText.trim()) return;
                  mindmap.addStep(node.id, todo.id, stepText.trim());
                  setStepText("");
                }}
                disabled={!stepText.trim()}
                aria-label="Adım ekle"
                className="text-primary disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
              <Input
                value={stepText}
                onChange={(e) => setStepText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && stepText.trim()) {
                    mindmap.addStep(node.id, todo.id, stepText.trim());
                    setStepText("");
                  }
                }}
                placeholder="Adım ekle"
                className="h-7 flex-1 border-0 bg-transparent p-0 text-sm text-primary placeholder:text-primary shadow-none focus-visible:ring-0"
              />
              <button
                type="button"
                onClick={() => {
                  if (!stepText.trim()) return;
                  mindmap.addStep(node.id, todo.id, stepText.trim());
                  setStepText("");
                }}
                disabled={!stepText.trim()}
                aria-label="Adım ekle"
                className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                Ekle
              </button>
            </div>

            <button
              onClick={runBreakdown}
              disabled={aiBusy}
              className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-primary disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiBusy ? "Bölünüyor..." : "AI ile adımlara böl"}
            </button>
          </div>


          {/* Quick actions */}
          <div className="space-y-1 border-t border-border pt-2">
            <Row
              icon={<Sun className="h-5 w-5" />}
              active={!!todo.myDay}
              label={todo.myDay ? "Günümden kaldır" : "Günüm görünümüne ekle"}
              onClick={() =>
                upd({ myDay: !todo.myDay, myDayAt: !todo.myDay ? Date.now() : undefined })
              }
            />

            <Row
              icon={<Bell className="h-5 w-5" />}
              active={!!todo.reminderAt}
              label={todo.reminderAt ? `Anımsat: ${fmt(todo.reminderAt)}` : "Bana anımsat"}
              onClick={() => setShowRem((v) => !v)}
              onClear={todo.reminderAt ? () => upd({ reminderAt: undefined }) : undefined}
            />
            {showRem && (
              <div className="px-3 pb-2">
                <Input
                  type="datetime-local"
                  value={toLocalInput(todo.reminderAt)}
                  onChange={(e) => {
                    const v = e.target.value;
                    upd({ reminderAt: v ? new Date(v).getTime() : undefined });
                  }}
                  className="h-9"
                />
              </div>
            )}

            <Row
              icon={<CalendarDays className="h-5 w-5" />}
              active={!!todo.dueAt}
              label={todo.dueAt ? `Son tarih: ${fmt(todo.dueAt)}` : "Son tarih ekle"}
              onClick={() => setShowDue((v) => !v)}
              onClear={todo.dueAt ? () => upd({ dueAt: undefined }) : undefined}
            />
            {showDue && (
              <div className="px-3 pb-2">
                <Input
                  type="date"
                  value={todo.dueAt ? new Date(todo.dueAt).toISOString().slice(0, 10) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    upd({ dueAt: v ? new Date(v + "T09:00").getTime() : undefined });
                  }}
                  className="h-9"
                />
              </div>
            )}

            <Row
              icon={<Repeat className="h-5 w-5" />}
              active={!!todo.recurrence}
              label={
                todo.recurrence
                  ? `Tekrar: ${
                      todo.recurrence === "daily"
                        ? "her gün"
                        : todo.recurrence === "weekly"
                          ? "her hafta"
                          : "her ay"
                    }`
                  : "Tekrar ekle"
              }
              onClick={() => setShowRec((v) => !v)}
              onClear={todo.recurrence ? () => upd({ recurrence: undefined }) : undefined}
            />
            {showRec && (
              <div className="flex gap-1.5 px-3 pb-2">
                {(["daily", "weekly", "monthly"] as Recurrence[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      upd({ recurrence: r });
                      setShowRec(false);
                    }}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                      todo.recurrence === r
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground hover:bg-muted/70"
                    }`}
                  >
                    {r === "daily" ? "Her gün" : r === "weekly" ? "Her hafta" : "Her ay"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Priority */}
          <div className="mt-3">
            <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Öncelik
            </p>
            <div className="flex flex-wrap gap-1.5 px-1">
              {([1, 2, 3, 4] as Priority[]).map((p) => {
                const meta = PRIORITY_META[p];
                const active = todo.priority === p;
                return (
                  <button
                    key={p}
                    onClick={() => upd({ priority: active ? undefined : p })}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      active ? meta.bg + " " + meta.color : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Flag className="h-3 w-3" />
                    {meta.short} · {meta.label}
                  </button>
                );
              })}
              {todo.priority && (
                <button
                  onClick={() => upd({ priority: undefined })}
                  className="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  Temizle
                </button>
              )}
            </div>
          </div>

          {/* Dependencies */}
          <DependencyEditor node={node} todo={todo} onUpdate={upd} />

          {/* Tags */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Etiketler
              </p>
              <button
                onClick={runAutoTag}
                disabled={tagBusy}
                className="flex items-center gap-1 text-[11px] font-semibold text-primary disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {tagBusy ? "..." : "AI öner"}
              </button>
            </div>
            <TagEditor tags={todo.tags ?? []} onChange={(tags) => upd({ tags })} />
          </div>

          {/* Note */}
          <div className="mt-3 rounded-2xl bg-muted/50 p-3">
            <Textarea
              value={todo.note ?? ""}
              onChange={(e) => upd({ note: e.target.value })}
              placeholder="Not ekle"
              className="min-h-[80px] resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 mt-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md">
            <Suspense fallback={<div className="h-24 rounded-xl bg-muted/50 animate-pulse" />}>
              <NodeImagePanel node={node} compact />
            </Suspense>
          </div>
        </div>
    </FormPanel>
  );
}

function Row({
  icon,
  label,
  active,
  onClick,
  onClear,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  onClear?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/50">
      <button onClick={onClick} className="flex flex-1 items-center gap-3 text-left">
        <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span className={`text-sm ${active ? "font-semibold text-foreground" : "text-foreground"}`}>
          {label}
        </span>
      </button>
      {onClear && (
        <button onClick={onClear} className="text-muted-foreground/60">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function DependencyEditor({
  node,
  todo,
  onUpdate,
}: {
  node: { id: string; todos: Todo[] };
  todo: Todo;
  onUpdate: (patch: Partial<Todo>) => void;
}) {
  const [picking, setPicking] = useState(false);
  const blockedBy = todo.blockedBy ?? [];
  const depMap = new Map(node.todos.map((t) => [t.id, t]));
  const candidates = node.todos.filter((t) => t.id !== todo.id && !blockedBy.includes(t.id));

  const add = (id: string) => {
    onUpdate({ blockedBy: [...blockedBy, id] });
    setPicking(false);
  };
  const remove = (id: string) =>
    onUpdate({ blockedBy: blockedBy.filter((x) => x !== id) });

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Bağımlılıklar
        </p>
        <button
          onClick={() => setPicking((v) => !v)}
          disabled={candidates.length === 0}
          className="flex items-center gap-1 text-[11px] font-semibold text-primary disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          {picking ? "Kapat" : "Ekle"}
        </button>
      </div>
      {blockedBy.length === 0 && !picking && (
        <p className="px-1 text-[11px] text-muted-foreground">
          Bu görev önce başka bir göreve bağlı değil.
        </p>
      )}
      <div className="space-y-1 px-1">
        {blockedBy.map((id) => {
          const dep = depMap.get(id);
          if (!dep) return null;
          return (
            <div
              key={id}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
            >
              <Link2 className="h-3 w-3 text-primary" />
              <span
                className={`flex-1 truncate ${dep.done ? "text-muted-foreground line-through" : ""}`}
              >
                {dep.text}
              </span>
              {!dep.done && (
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                  Bekliyor
                </span>
              )}
              <button onClick={() => remove(id)} className="text-muted-foreground/70 hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      {picking && candidates.length > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-card">
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => add(c.id)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <Plus className="h-3 w-3 text-primary" />
              <span className={`flex-1 truncate ${c.done ? "text-muted-foreground line-through" : ""}`}>
                {c.text}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepItem({
  step,
  onToggle,
  onRemove,
}: {
  step: { id: string; text: string; done: boolean };
  onToggle: () => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={step}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-lg bg-card px-1 py-1"
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none px-0.5 text-muted-foreground/50 active:cursor-grabbing"
        aria-label="Sürükle"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        onClick={onToggle}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          step.done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40"
        }`}
      >
        {step.done && <Check className="h-2.5 w-2.5" />}
      </button>
      <span
        className={`flex-1 text-sm ${step.done ? "text-muted-foreground line-through" : ""}`}
      >
        {step.text}
      </span>
      <button onClick={onRemove} className="text-muted-foreground/60">
        <X className="h-4 w-4" />
      </button>
    </Reorder.Item>
  );
}
