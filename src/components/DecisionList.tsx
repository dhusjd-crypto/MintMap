import { useState } from "react";
import { Plus, Scale, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { decisions, useDecisions } from "@/lib/decision-store";

// Karar kayıtları — hem bir mindmap düğümüne (nodeId) hem bir Borsa şirketine
// (watchId) bağlanabilir. Ne / neden / sonradan gerçekleşen sonuç.

export function DecisionList({ nodeId, watchId }: { nodeId?: string; watchId?: string }) {
  const all = useDecisions();
  const list = all.filter((d) => (nodeId ? d.nodeId === nodeId : d.watchId === watchId));
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");

  const add = () => {
    if (decisions.add({ title, nodeId, watchId, rationale: why })) {
      setTitle("");
      setWhy("");
    }
  };

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">
        <Scale className="mr-1 inline h-4 w-4" /> Kararlar
      </p>
      <div className="space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Karar başlığı (örn. Pozisyonu koru)"
        />
        <Textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Neden? (gerekçe — opsiyonel)"
          className="min-h-[60px] resize-none bg-muted/50 text-[13px]"
        />
        <Button size="sm" className="w-full" disabled={!title.trim()} onClick={add}>
          <Plus className="mr-1 h-4 w-4" /> Karar ekle
        </Button>
      </div>

      {list.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {list.map((d) => (
            <div key={d.id} className="rounded-xl bg-muted/50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{d.title}</span>
                <button
                  onClick={() => decisions.remove(d.id)}
                  aria-label="Kararı sil"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {d.rationale && (
                <p className="mt-0.5 text-[12px] text-muted-foreground">{d.rationale}</p>
              )}
              <Textarea
                defaultValue={d.outcome ?? ""}
                placeholder="Sonuç / değerlendirme (sonradan doldur)"
                onBlur={(e) =>
                  decisions.update(d.id, { outcome: e.target.value.trim() || undefined })
                }
                className="mt-1.5 min-h-[40px] resize-none bg-background text-[12px]"
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {new Date(d.decidedAt).toLocaleDateString("tr-TR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
