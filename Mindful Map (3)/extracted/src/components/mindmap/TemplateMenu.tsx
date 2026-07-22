import { AnimatePresence, motion } from "framer-motion";
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

export function TemplateMenu({ open, onToggle, selectedNode, onApply, onSaveFromNode }: Props) {
  const [custom, setCustom] = useState<CustomTemplate[]>([]);

  useEffect(() => {
    setCustom(customTemplates.list());
    return customTemplates.subscribe(() => setCustom(customTemplates.list()));
  }, []);

  const handleSaveCurrent = () => {
    if (!selectedNode || !onSaveFromNode) return;
    const name = window.prompt("Şablon adı", selectedNode.title)?.trim();
    if (!name) return;
    const emoji = window.prompt("Emoji (opsiyonel)", "🌱")?.trim() || "🌱";
    onSaveFromNode(name, emoji);
  };

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`"${name}" şablonunu sil?`)) return;
    customTemplates.remove(id);
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
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.9 }}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid="templates-menu"
            className="absolute left-11 bottom-0 z-30 max-h-[70vh] w-64 overflow-y-auto rounded-2xl bg-card p-2 shadow-leaf"
          >
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {selectedNode ? `→ ${selectedNode.title}` : "→ Kök"}
            </p>

            {selectedNode && onSaveFromNode && (
              <button
                onClick={handleSaveCurrent}
                className="mb-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Bu düğümü şablon olarak kaydet</span>
              </button>
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
                {custom.map((t) => (
                  <div key={t.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => onApply(t.id)}
                      className="flex flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="text-base">{t.emoji}</span>
                      <span className="font-medium">{t.name}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(t.id, t.name)}
                      aria-label={`${t.name} sil`}
                      className="mr-1 rounded-lg p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
