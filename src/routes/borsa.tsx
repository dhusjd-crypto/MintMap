import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Plus, X, CalendarClock } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  watchlist,
  useWatchlist,
  WATCH_STATUS,
  type WatchItem,
  type WatchStatus,
} from "@/lib/watchlist-store";

export const Route = createFileRoute("/borsa")({
  head: () => ({ meta: [{ title: "MintMap — Borsa" }] }),
  component: BorsaScreen,
});

const STATUS_ORDER: WatchStatus[] = ["watching", "researching", "holding", "exited"];

function toDateInput(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Field({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onCommit: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <Textarea
        defaultValue={value ?? ""}
        placeholder={placeholder}
        onBlur={(e) => onCommit(e.target.value)}
        className="min-h-[52px] resize-none bg-muted/50 text-[13px]"
      />
    </div>
  );
}

function WatchCard({ item }: { item: WatchItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-card px-4 py-3 shadow-soft">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="font-bold">{item.symbol}</span>
          {item.name && (
            <span className="truncate text-[12px] text-muted-foreground">{item.name}</span>
          )}
        </button>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {WATCH_STATUS[item.status]}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Kapat" : "Aç"}
          className="shrink-0 text-muted-foreground"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {item.earningsAt && !open && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" /> Bilanço:{" "}
          {new Date(item.earningsAt).toLocaleDateString("tr-TR", {
            day: "2-digit",
            month: "short",
          })}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={item.status}
              onChange={(e) => watchlist.update(item.id, { status: e.target.value as WatchStatus })}
              className="rounded-md border border-input bg-background px-2 py-1 text-[12px]"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {WATCH_STATUS[s]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3 w-3" /> Bilanço
              <input
                type="date"
                value={toDateInput(item.earningsAt)}
                onChange={(e) =>
                  watchlist.update(item.id, {
                    earningsAt: e.target.value ? new Date(e.target.value).getTime() : undefined,
                  })
                }
                className="rounded-md border border-input bg-background px-1.5 py-0.5 text-[12px]"
              />
            </label>
          </div>

          <Field
            label="Sektör"
            value={item.sector}
            placeholder="örn. Savunma, Bankacılık"
            onCommit={(v) => watchlist.update(item.id, { sector: v.trim() || undefined })}
          />
          <Field
            label="Yatırım tezi"
            value={item.thesis}
            placeholder="Neden takip ediyorsun / tezin ne?"
            onCommit={(v) => watchlist.update(item.id, { thesis: v.trim() || undefined })}
          />
          <Field
            label="Riskler"
            value={item.risks}
            placeholder="Tezi bozabilecek riskler"
            onCommit={(v) => watchlist.update(item.id, { risks: v.trim() || undefined })}
          />
          <Field
            label="Beklenen katalizörler"
            value={item.catalysts}
            placeholder="Fiyatı hareketlendirebilecek olaylar"
            onCommit={(v) => watchlist.update(item.id, { catalysts: v.trim() || undefined })}
          />
          <Field
            label="Notlar"
            value={item.notes}
            placeholder="Serbest not"
            onCommit={(v) => watchlist.update(item.id, { notes: v.trim() || undefined })}
          />

          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => watchlist.remove(item.id)}
          >
            <X className="mr-1 h-4 w-4" /> Listeden çıkar
          </Button>
        </div>
      )}
    </div>
  );
}

function BorsaScreen() {
  const items = useWatchlist();
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [filter, setFilter] = useState<WatchStatus | "all">("all");

  const add = () => {
    if (watchlist.add({ symbol, name })) {
      setSymbol("");
      setName("");
    }
  };

  const shown = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <main className="relative flex h-svh w-full flex-col">
      <header className="z-10 px-5 pt-5 pb-3">
        <h1 className="text-lg font-bold leading-none">Borsa</h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          İzleme listesi ve yatırım tezleri — bilgi amaçlıdır, yatırım tavsiyesi değildir.
        </p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        <div className="flex gap-2">
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Sembol (ASELS)"
            className="w-32 uppercase"
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Şirket adı (opsiyonel)"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Button size="icon" onClick={add} disabled={!symbol.trim()} aria-label="Ekle">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["all", ...STATUS_ORDER] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                filter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s === "all" ? "Tümü" : WATCH_STATUS[s]}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? "Henüz şirket eklemedin. Yukarıdan bir sembol ekle."
              : "Bu durumda şirket yok."}
          </p>
        ) : (
          <div className="space-y-2">
            {shown.map((item) => (
              <WatchCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
