import { useMemo, useState } from "react";
import { Star, Sun } from "lucide-react";
import { FormPanel, Field } from "@/components/FormPanel";
import { notifySaved, notifySaveFailed } from "@/lib/save-feedback";
import { mindmap, useNodes, type Priority, type Todo } from "@/lib/mindmap-store";
import { PRIORITY_META } from "@/lib/task-utils";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Preselect the node the task is added to (e.g. from the mindmap). */
  nodeId?: string | null;
};

function localToTs(v: string): number | undefined {
  if (!v) return undefined;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : undefined;
}

export function TaskFormPanel({ open, onClose, nodeId }: Props) {
  const nodes = useNodes();
  const defaultNode = nodeId || nodes.find((n) => !n.parentId)?.id || nodes[0]?.id || "";

  const [targetId, setTargetId] = useState(defaultNode);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [reminder, setReminder] = useState("");
  const [priority, setPriority] = useState<Priority | 0>(0);
  const [starred, setStarred] = useState(false);
  const [myDay, setMyDay] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the form each time the panel is (re)opened.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setTargetId(defaultNode);
    setText("");
    setNote("");
    setDue("");
    setReminder("");
    setPriority(0);
    setStarred(false);
    setMyDay(false);
    setTagsInput("");
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const dirty =
    text.trim().length > 0 ||
    note.trim().length > 0 ||
    !!due ||
    !!reminder ||
    priority !== 0 ||
    starred ||
    myDay ||
    tagsInput.trim().length > 0;

  // §11: keep Save enabled so validation can explain what is missing instead
  // of leaving the user with a dead button.
  const canSave = true;

  const tags = useMemo(
    () =>
      tagsInput
        .split(/[,\n]/)
        .map((t) => t.replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean),
    [tagsInput],
  );

  function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const extra: Partial<Todo> = {};
      const d = localToTs(due);
      const r = localToTs(reminder);
      if (d) extra.dueAt = d;
      if (r) extra.reminderAt = r;
      if (priority !== 0) extra.priority = priority;
      if (starred) extra.starred = true;
      if (myDay) {
        extra.myDay = true;
        extra.myDayAt = Date.now();
      }
      if (tags.length) extra.tags = tags;
      mindmap.addTodo(targetId, text.trim(), null, extra);
      const nodeName = nodes.find((n) => n.id === targetId)?.title ?? "düğüm";
      // §12: notify → close → reveal + flash the node that changed.
      notifySaved(`Görev oluşturuldu → ${nodeName}`, targetId);
      onClose();
    } catch (e) {
      // §14: keep the panel open with the user's input intact.
      notifySaveFailed(e);
    } finally {
      setSaving(false);
    }
  }

  /** §11: full validation on save. */
  function validate() {
    const errs: Record<string, string> = {};
    if (!text.trim()) errs.text = "Bu alan zorunludur.";
    if (!targetId) errs.node = "Bir düğüm seç.";
    const d = localToTs(due);
    const r = localToTs(reminder);
    if (d && r && r > d) {
      errs.reminder = "Hatırlatma, bitiş tarihinden sonra olamaz.";
    }
    return errs;
  }

  return (
    <FormPanel
      open={open}
      onClose={onClose}
      title="Yeni görev"
      description={nodeId ? nodes.find((n) => n.id === nodeId)?.title : "Bir düğüme görev ekle"}
      dirty={dirty}
      saving={saving}
      canSave={canSave}
      saveLabel="Görevi ekle"
      onSave={handleSave}
      validate={validate}
    >
      <Field name="text" label="Görev" required>
        <input
          data-autofocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
          }}
          placeholder="Ne yapılacak?"
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
      </Field>

      {/* Only show the node picker when the caller didn't fix one. */}
      {!nodeId && (
        <Field name="node" label="Düğüm" required>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2.5 py-2.5 text-sm"
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.parentId ? "— " : ""}
                {n.title}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Not" optional>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Detay ekle…"
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field name="due" label="Bitiş" optional>
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
          />
        </Field>
        <Field name="reminder" label="Hatırlatma" optional>
          <input
            type="datetime-local"
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
          />
        </Field>
      </div>

      <Field label="Öncelik">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={priority === 0} onClick={() => setPriority(0)}>
            Yok
          </Chip>
          {([1, 2, 3, 4] as Priority[]).map((p) => (
            <Chip key={p} active={priority === p} onClick={() => setPriority(p)}>
              {PRIORITY_META[p]?.label ?? `P${p}`}
            </Chip>
          ))}
        </div>
      </Field>

      <div className="flex gap-2">
        <Toggle active={starred} onClick={() => setStarred((v) => !v)} icon={<Star className="h-4 w-4" />}>
          Yıldız
        </Toggle>
        <Toggle active={myDay} onClick={() => setMyDay((v) => !v)} icon={<Sun className="h-4 w-4" />}>
          Günüm
        </Toggle>
      </div>

      <Field label="Etiketler" help="Virgülle ayır — ör: iş, acil" optional>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="ör: iş, acil"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
      </Field>
    </FormPanel>
  );
}


function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-input bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
