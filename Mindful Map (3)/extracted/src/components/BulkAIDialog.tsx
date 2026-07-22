import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, Copy, Download, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { aiBulkSummarize, aiWeeklyReport } from "@/lib/ai.functions";
import { mindmap } from "@/lib/mindmap-store";
import { downloadText } from "@/lib/export";

type Range = "this-week" | "last-week" | "last-30";

function rangeBounds(r: Range): { from: number; to: number; label: string } {
  const now = new Date();
  const to = now.getTime();
  if (r === "this-week") {
    const day = (now.getDay() + 6) % 7; // Mon=0
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - day);
    return { from: start.getTime(), to, label: "Bu hafta" };
  }
  if (r === "last-week") {
    const day = (now.getDay() + 6) % 7;
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - day);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return { from: start.getTime(), to: end.getTime(), label: "Geçen hafta" };
  }
  return { from: to - 30 * 86400_000, to, label: "Son 30 gün" };
}

export function BulkAIDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<"summary" | "weekly">("summary");
  const [range, setRange] = useState<Range>("this-week");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [meta, setMeta] = useState<string>("");

  const summarize = useServerFn(aiBulkSummarize);
  const weekly = useServerFn(aiWeeklyReport);

  const rangeInfo = useMemo(() => rangeBounds(range), [range]);

  const runSummary = async () => {
    const ws = mindmap.workspace.current();
    const nodes = mindmap.getSnapshot();
    if (!nodes.length) {
      toast.error("Bu çalışma alanında düğüm yok");
      return;
    }
    setBusy(true);
    try {
      const r = await summarize({
        data: {
          workspaceName: ws?.name,
          nodes: nodes.map((n) => ({
            title: n.title,
            note: n.note,
            tags: n.tags,
            todos: n.todos.map((t) => ({ text: t.text, done: t.done })),
          })),
        },
      });
      setResult(r.markdown);
      setMeta(`${r.count} düğüm${r.truncated ? " (ilk 400)" : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runWeekly = async () => {
    const bounds = rangeBounds(range);
    const all = mindmap.allTodos();
    const completed = all
      .filter((x) => x.todo.completedAt && x.todo.completedAt >= bounds.from && x.todo.completedAt <= bounds.to)
      .map((x) => ({
        text: x.todo.text,
        wsName: x.wsName,
        nodeTitle: x.nodeTitle,
        completedAt: new Date(x.todo.completedAt!).toISOString(),
      }));
    const open = all
      .filter((x) => !x.todo.done)
      .map((x) => ({
        text: x.todo.text,
        wsName: x.wsName,
        nodeTitle: x.nodeTitle,
        dueAt: x.todo.dueAt ? new Date(x.todo.dueAt).toISOString() : undefined,
        starred: !!x.todo.starred,
      }));
    const store = mindmap.getFullSnapshot();
    const createdNodes = store.workspaces.flatMap((w) =>
      w.nodes
        .filter((n) => n.createdAt && n.createdAt >= bounds.from && n.createdAt <= bounds.to)
        .map((n) => ({ title: n.title, wsName: w.name, createdAt: new Date(n.createdAt).toISOString() })),
    );
    if (!completed.length && !open.length && !createdNodes.length) {
      toast.error("Bu aralıkta veri yok");
      return;
    }
    setBusy(true);
    try {
      const r = await weekly({
        data: {
          from: new Date(bounds.from).toISOString(),
          to: new Date(bounds.to).toISOString(),
          completed,
          open,
          createdNodes,
        },
      });
      setResult(r.markdown);
      setMeta(`${r.stats.completed} tamamlandı · ${r.stats.open} açık · ${r.stats.created} yeni düğüm`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(result);
    toast.success("Panoya kopyalandı");
  };

  const download = () => {
    const name = tab === "summary" ? "mintmap-ozet.md" : `mintmap-rapor-${range}.md`;
    downloadText(name, result, "text/markdown");
    toast.success("İndirildi");
  };

  const saveAsNode = () => {
    const ws = mindmap.workspace.current();
    const root = mindmap.getSnapshot().find((n) => n.parentId === null);
    if (!ws || !root) return;
    const title = tab === "summary" ? `📋 Özet (${new Date().toLocaleDateString("tr-TR")})` : `📊 ${rangeInfo.label}`;
    const node = mindmap.add(root.id, title);
    mindmap.update(node.id, { note: result });
    toast.success("Düğüm olarak kaydedildi");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Toplu AI işlemler
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          <button
            onClick={() => {
              setTab("summary");
              setResult("");
            }}
            className={`flex-1 rounded-md py-1.5 ${tab === "summary" ? "bg-card shadow-soft" : "text-muted-foreground"}`}
          >
            Çalışma alanı özeti
          </button>
          <button
            onClick={() => {
              setTab("weekly");
              setResult("");
            }}
            className={`flex-1 rounded-md py-1.5 ${tab === "weekly" ? "bg-card shadow-soft" : "text-muted-foreground"}`}
          >
            Haftalık rapor
          </button>
        </div>

        {tab === "summary" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bu çalışma alanındaki tüm düğümleri (başlık, not, görevler) özetler ve öne çıkan aksiyonları listeler.
            </p>
            <Button onClick={runSummary} disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Özet oluştur
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
              {(["this-week", "last-week", "last-30"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`flex-1 rounded-md py-1.5 ${range === r ? "bg-card shadow-soft" : "text-muted-foreground"}`}
                >
                  {rangeBounds(r).label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {rangeInfo.label}: tamamlanan görevler, açık işler ve oluşturulan düğümler için markdown rapor.
            </p>
            <Button onClick={runWeekly} disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Rapor oluştur
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{meta}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={copy}>
                  <Copy className="mr-1 h-3 w-3" /> Kopyala
                </Button>
                <Button variant="outline" size="sm" onClick={download}>
                  <Download className="mr-1 h-3 w-3" /> İndir
                </Button>
                <Button variant="outline" size="sm" onClick={saveAsNode}>
                  Düğüm olarak kaydet
                </Button>
              </div>
            </div>
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed">
              {result}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
