import { useState } from "react";
import { ChevronDown, Plus, Pencil, Copy, Trash2, Check } from "lucide-react";
import { mindmap, useWorkspaces } from "@/lib/mindmap-store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

const EMOJI_CHOICES = ["🌿", "💼", "🎓", "💡", "🎨", "🏠", "🧠", "🚀", "📚", "🧘"];

export function WorkspaceSwitcher() {
  const { workspaces, currentId } = useWorkspaces();
  const current = workspaces.find((w) => w.id === currentId);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", emoji: "🌿" });

  if (!current) return null;

  const startEdit = (id: string, name: string, emoji?: string) => {
    setCreating(false);
    setConfirmingId(null);
    setEditingId(id);
    setDraft({ name, emoji: emoji ?? "🌿" });
  };

  const saveEdit = () => {
    if (!editingId || !draft.name.trim()) return;
    mindmap.workspace.rename(editingId, draft.name.trim(), draft.emoji);
    setEditingId(null);
  };

  // Creating used to call window.prompt(), which returns null without ever
  // showing anything in an installed PWA and in several mobile browsers — the
  // "new workspace" button simply did nothing there. Inline form instead.
  const startCreate = () => {
    setEditingId(null);
    setConfirmingId(null);
    setDraft({ name: "", emoji: "🌿" });
    setCreating(true);
  };

  const saveCreate = () => {
    const name = draft.name.trim();
    if (!name) return;
    mindmap.workspace.create(name, draft.emoji);
    toast.success(`'${name}' oluşturuldu`);
    setCreating(false);
    setOpen(false);
  };

  const removeWorkspace = (id: string, name: string) => {
    mindmap.workspace.remove(id);
    setConfirmingId(null);
    toast.success(`'${name}' silindi`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-medium shadow-soft transition hover:bg-accent/40"
          aria-label="Çalışma alanını değiştir"
        >
          <span className="text-sm leading-none">{current.emoji ?? "🌿"}</span>
          <span className="max-w-[8rem] truncate">{current.name}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Çalışma alanları
        </p>
        <ul className="space-y-0.5">
          {workspaces.map((w) => {
            const active = w.id === currentId;
            const isEdit = editingId === w.id;
            return (
              <li key={w.id} className="group rounded-lg hover:bg-accent/40">
                {confirmingId === w.id ? (
                  /* window.confirm() is blocked in an installed PWA, so the
                     delete button did nothing there. Confirm in-place. */
                  <div className="flex items-center gap-2 p-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{w.name}</span> silinsin mi?
                      <span className="block text-[11px] text-muted-foreground">
                        {w.nodes.length} düğüm kalıcı olarak gider.
                      </span>
                    </span>
                    <button
                      onClick={() => removeWorkspace(w.id, w.name)}
                      className="shrink-0 rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sil
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold hover:bg-muted/70"
                    >
                      Vazgeç
                    </button>
                  </div>
                ) : isEdit ? (
                  <div className="flex items-center gap-1 p-1">
                    <select
                      value={draft.emoji}
                      onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                      className="rounded bg-background px-1 py-1 text-sm"
                    >
                      {EMOJI_CHOICES.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                    <input
                      autoFocus
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="min-w-0 flex-1 rounded bg-background px-2 py-1 text-sm outline-none ring-1 ring-border focus:ring-primary"
                    />
                    <button
                      onClick={saveEdit}
                      className="rounded p-1 text-primary hover:bg-primary/10"
                      aria-label="Kaydet"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        mindmap.workspace.switch(w.id);
                        setOpen(false);
                      }}
                      className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                    >
                      <span className="text-base leading-none">{w.emoji ?? "🌿"}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {w.nodes.length} düğüm
                      </span>
                      {active && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                    </button>
                    {/*
                      These were opacity-0 until group-hover, which means they
                      never appeared on a touch screen — rename/duplicate/delete
                      were unreachable on mobile. Only reveal-on-hover where the
                      device actually has hover.
                    */}
                    <div className="flex shrink-0 items-center pr-1 opacity-100 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                      <button
                        onClick={() => startEdit(w.id, w.name, w.emoji)}
                        className="rounded p-1.5 hover:bg-muted"
                        aria-label={`${w.name} — yeniden adlandır`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => mindmap.workspace.duplicate(w.id)}
                        className="rounded p-1.5 hover:bg-muted"
                        aria-label={`${w.name} — kopyala`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {workspaces.length > 1 && (
                        <button
                          onClick={() => setConfirmingId(w.id)}
                          className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                          aria-label={`${w.name} — sil`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-1 border-t border-border/60 pt-1">
          {creating ? (
            <div className="flex items-center gap-1 p-1">
              <select
                value={draft.emoji}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                className="rounded bg-background px-1 py-1 text-sm"
                aria-label="Simge"
              >
                {EMOJI_CHOICES.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <input
                autoFocus
                value={draft.name}
                placeholder="Çalışma alanı adı"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                className="min-w-0 flex-1 rounded bg-background px-2 py-1 text-sm outline-none ring-1 ring-border focus:ring-primary"
                aria-label="Yeni çalışma alanı adı"
              />
              <button
                onClick={saveCreate}
                disabled={!draft.name.trim()}
                className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-40"
                aria-label="Oluştur"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={startCreate}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" /> Yeni çalışma alanı
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
