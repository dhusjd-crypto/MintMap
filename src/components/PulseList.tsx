import { useState } from "react";
import { toast } from "sonner";
import { Check, Link2, ListPlus, StickyNote, X, ExternalLink } from "lucide-react";
import { pulse, usePulse, type PulseItem } from "@/lib/pulse-store";
import { mindmap, useNodes } from "@/lib/mindmap-store";

// Pulse akışının listesi. Şu an tüm kayıtlar DEMO — bu üstte açıkça belirtilir.
// Her kayıt bir düğüme bağlanabilir, göreve dönüştürülebilir veya nota eklenebilir.

const IMPORTANCE: Record<1 | 2 | 3, { label: string; dot: string }> = {
  3: { label: "Yüksek", dot: "bg-red-500" },
  2: { label: "Orta", dot: "bg-amber-500" },
  1: { label: "Düşük", dot: "bg-muted-foreground/40" },
};

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "az önce";
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

export function PulseList() {
  const items = usePulse();
  const nodes = useNodes();
  const [openId, setOpenId] = useState<string | null>(null);
  const [targetNode, setTargetNode] = useState<string>("");

  const anyDemo = items.some((p) => p.demo);

  const toNode = () => nodes.find((n) => n.id === targetNode);

  const linkNode = (item: PulseItem) => {
    const n = toNode();
    if (!n) return toast.error("Önce bir düğüm seç");
    pulse.toggleNode(item.id, n.id);
    toast.success(`"${n.title}" düğümüne bağlandı`);
  };

  const toTask = (item: PulseItem) => {
    const n = toNode();
    if (!n) return toast.error("Önce bir düğüm seç");
    mindmap.addTodo(n.id, item.title);
    toast.success(`"${n.title}" düğümüne görev eklendi`);
  };

  const toNote = (item: PulseItem) => {
    const n = toNode();
    if (!n) return toast.error("Önce bir düğüm seç");
    const add = `\n\n**${item.title}**\n${item.summary}${item.source ? `\n_${item.source}_` : ""}`;
    mindmap.update(n.id, { note: (n.note ?? "").trim() + add });
    toast.success(`"${n.title}" notuna eklendi`);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Henüz gelişme yok. Gerçek kaynaklar henüz bağlanmadı.
        </p>
        <button
          onClick={() => pulse.seedDemo()}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Demo veri yükle
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-4 py-3">
      {anyDemo && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px]">
          <span className="font-semibold">Demo veri — gerçek kaynak bağlanmadı</span>
          <button
            onClick={() => pulse.clearAll()}
            className="font-semibold text-muted-foreground hover:text-destructive"
          >
            Temizle
          </button>
        </div>
      )}

      {items.map((item) => {
        const imp = IMPORTANCE[item.importance];
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className={`rounded-2xl bg-card px-4 py-3 shadow-soft ${item.read ? "opacity-60" : ""}`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${imp.dot}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{item.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {item.summary}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>{item.source}</span>
                  <span>·</span>
                  <span>{relTime(item.publishedAt)}</span>
                  {item.nodeIds.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-primary">{item.nodeIds.length} bağlı düğüm</span>
                    </>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-0.5 text-primary underline"
                    >
                      <ExternalLink className="h-2.5 w-2.5" /> Kaynak
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={() => pulse.markRead(item.id, !item.read)}
                aria-label={item.read ? "Okunmadı yap" : "Okundu yap"}
                className={`shrink-0 rounded-full p-1 ${item.read ? "text-primary" : "text-muted-foreground"}`}
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => pulse.dismiss(item.id)}
                aria-label="Kaldır"
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => {
                setOpenId(isOpen ? null : item.id);
                setTargetNode("");
              }}
              className="mt-2 text-[11px] font-semibold text-primary"
            >
              {isOpen ? "Kapat" : "İşlem yap"}
            </button>

            {isOpen && (
              <div className="mt-2 space-y-2 rounded-xl bg-muted/40 p-2.5">
                <select
                  value={targetNode}
                  onChange={(e) => setTargetNode(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Düğüm seç…</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => linkNode(item)}
                    className="flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold shadow-soft"
                  >
                    <Link2 className="h-3 w-3" /> Düğüme bağla
                  </button>
                  <button
                    onClick={() => toTask(item)}
                    className="flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold shadow-soft"
                  >
                    <ListPlus className="h-3 w-3" /> Göreve dönüştür
                  </button>
                  <button
                    onClick={() => toNote(item)}
                    className="flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold shadow-soft"
                  >
                    <StickyNote className="h-3 w-3" /> Nota ekle
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
