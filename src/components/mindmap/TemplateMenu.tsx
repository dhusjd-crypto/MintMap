import { motion } from "framer-motion";
import { useOverlayPresence } from "@/lib/use-overlay-presence";
import { LayoutTemplate, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { TEMPLATES } from "@/lib/templates";
import { customTemplates, type CustomTemplate } from "@/lib/custom-templates";
import type { MindNode } from "@/lib/mindmap-store";

type Props = {
  open: boolean;
  onToggle: () => void;
  selectedNode: MindNode | undefined;
  onApply: (id: string) => void;
  onSaveFromNode?: (name: string, emoji: string) => void;
};

const EMOJI_CHOICES = ["🌱", "💼", "🎓", "💡", "🎨", "🏠", "🧠", "🚀", "📚", "🗂️"];

export function TemplateMenu({ open, onToggle, selectedNode, onApply, onSaveFromNode }: Props) {
  const menuMounted = useOverlayPresence(open, 220);
  const [custom, setCustom] = useState<CustomTemplate[]>([]);
  // window.prompt/confirm are blocked in an installed PWA (they return null
  // without showing anything), so save & delete are inline flows instead.
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ name: "", emoji: "🌱" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    setCustom(customTemplates.list());
    return customTemplates.subscribe(() => setCustom(customTemplates.list()));
  }, []);

  useEffect(() => {
    if (!open) {
      setSaving(false);
      setConfirmingId(null);
    }
  }, [open]);

  const startSave = () => {
    if (!selectedNode) return;
    setConfirmingId(null);
    setDraft({ name: selectedNode.title, emoji: "🌱" });
    setSaving(true);
  };

  const commitSave = () => {
    const name = draft.name.trim();
    if (!name || !onSaveFromNode) return;
    onSaveFromNode(name, draft.emoji);
    setSaving(false);
  };

  return (
    <div className="relative">
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggle}
        data-testid="templates-toggle"
        className={`flex h-9 w-9 items-center justify-center rounded-full shadow-soft ${
          open ? "bg-primary text-primary-foreground" : "bg-card"
        }`}
        aria-label="Şablonlar"
        title="Şablon ekle"
      >
        <LayoutTemplate className="h-4 w-4" />
      </button>
      {menuMounted && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.9 }}
            animate={{ opacity: open ? 1 : 0, x: open ? 0 : -8, scale: open ? 1 : 0.9 }}
            transition={{ duration: 0.18 }}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid="templates-menu"
            style={{ pointerEvents: open ? "auto" : "none" }}
            className="absolute left-11 bottom-0 z-30 max-h-[70vh] w-64 overflow-y-auto rounded-2xl bg-card p-2 shadow-leaf"
          >
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {selectedNode ? `→ ${selectedNode.title}` : "→ Kök"}
            </p>

            {selectedNode && onSaveFromNode && !saving && (
              <button
                onClick={startSave}
                className="mb-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Bu düğümü şablon olarak kaydet</span>
              </button>
            )}
            {saving && (
              <div className="mb-1 flex items-center gap-1 rounded-xl border border-border p-1.5">
                <select
                  value={draft.emoji}
                  onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                  className="rounded bg-background px-1 py-1 text-sm"
                  aria-label="Şablon simgesi"
                >
                  {EMOJI_CHOICES.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
                <input
                  autoFocus
                  value={draft.name}
                  placeholder="Şablon adı"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitSave();
                    if (e.key === "Escape") setSaving(false);
                  }}
                  className="min-w-0 flex-1 rounded bg-background px-2 py-1 text-sm outline-none ring-1 ring-border focus:ring-primary"
                  aria-label="Şablon adı"
                />
                <button
                  onClick={commitSave}
                  disabled={!draft.name.trim()}
                  className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-40"
                  aria-label="Şablonu kaydet"
                >
                  <Save className="h-4 w-4" />
                </button>
              </div>
            )}

            <p className="px-2 pt-1 text-[9px] font-semibold uppercase text-muted-foreground/70">Hazır</p>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => onApply(t.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="text-base">{t.emoji}</span>
                <span className="font-medium">{t.name}</span>
              </button>
            ))}

            {custom.length > 0 && (
              <>
                <p className="px-2 pt-2 text-[9px] font-semibold uppercase text-muted-foreground/70">Sizin</p>
                {custom.map((t) =>
                  confirmingId === t.id ? (
                    <div key={t.id} className="flex items-center gap-2 rounded-xl bg-destructive/5 px-2.5 py-2">
                      <span className="min-w-0 flex-1 truncate text-xs">
                        <span className="font-medium">{t.name}</span> silinsin mi?
                      </span>
                      <button
                        onClick={() => {
                          customTemplates.remove(t.id);
                          setConfirmingId(null);
                        }}
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
                  ) : (
                    <div key={t.id} className="group flex items-center gap-1">
                      <button
                        onClick={() => onApply(t.id)}
                        className="flex flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="text-base">{t.emoji}</span>
                        <span className="font-medium">{t.name}</span>
                      </button>
                      {/* Visible by default; hover-reveal only where hover exists
                          (opacity-0 alone made this unreachable on touch). */}
                      <button
                        onClick={() => setConfirmingId(t.id)}
                        aria-label={`${t.name} sil`}
                        className="mr-1 rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ),
                )}
              </>
            )}
          </motion.div>
        )}
    </div>
  );
}
