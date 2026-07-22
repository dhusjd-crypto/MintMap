import { useState } from "react";
import { Plus, X } from "lucide-react";

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  compact?: boolean;
};

export function TagEditor({ tags, onChange, placeholder = "Etiket ekle", compact }: Props) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().replace(/^#/, "");
    if (!v) return;
    if (tags.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...tags, v]);
    setDraft("");
  };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t));

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "rounded-xl bg-muted/40 p-2"}`}>
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          #{t}
          <button
            onClick={() => remove(t)}
            aria-label="Etiketi kaldır"
            className="opacity-60 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <div className="flex flex-1 items-center gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          placeholder={placeholder}
          className="min-w-[80px] flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
        />
        {draft.trim() && (
          <button onClick={add} className="text-primary" aria-label="Etiket ekle">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
