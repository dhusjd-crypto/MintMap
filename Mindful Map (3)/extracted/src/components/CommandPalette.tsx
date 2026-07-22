import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { mindmap, useNodes } from "@/lib/mindmap-store";
import { readBackupPayload } from "@/lib/backup-format";
import { exportMarkdown, downloadText } from "@/lib/export";
import { BulkAIDialog } from "@/components/BulkAIDialog";
import { toast } from "sonner";
import { Network, ListChecks, CalendarDays, Columns3, Download, Upload, Moon, Sparkles, FileText, Plus, Undo2, Redo2 } from "lucide-react";

function importBackupSnapshot(parsed: unknown) {
  const backup = readBackupPayload(parsed);
  if (backup.kind === "legacy") mindmap.importSnapshot(backup.nodes);
  else mindmap.importFullSnapshot(backup.store);
  return backup.summary;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const nodes = useNodes();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => setOpen(false);
  const root = useMemo(() => nodes.find((n) => n.parentId === null), [nodes]);

  const run = (fn: () => void) => {
    fn();
    close();
  };

  const importJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        const parsed = JSON.parse(text);
        const summary = importBackupSnapshot(parsed);
        toast.success(`Yedek yüklendi (${summary})`);
      } catch (e) {
        toast.error("Yükleme başarısız: " + (e as Error).message);
      }
    };
    input.click();
  };

  return (
    <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Ara veya komut çalıştır… (⌘K)" />
      <CommandList>
        <CommandEmpty>Sonuç yok.</CommandEmpty>
        <CommandGroup heading="Git">
          <CommandItem onSelect={() => run(() => navigate({ to: "/" }))}>
            <Network className="mr-2 h-4 w-4" /> Mindmap
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate({ to: "/todos" }))}>
            <ListChecks className="mr-2 h-4 w-4" /> Görevler
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate({ to: "/board" }))}>
            <Columns3 className="mr-2 h-4 w-4" /> Pano
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate({ to: "/calendar" }))}>
            <CalendarDays className="mr-2 h-4 w-4" /> Takvim
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Eylemler">
          <CommandItem
            onSelect={() => run(() => mindmap.canUndo() && mindmap.undo())}
            disabled={!mindmap.canUndo()}
          >
            <Undo2 className="mr-2 h-4 w-4" /> Geri al (⌘Z)
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => mindmap.canRedo() && mindmap.redo())}
            disabled={!mindmap.canRedo()}
          >
            <Redo2 className="mr-2 h-4 w-4" /> Yinele (⌘⇧Z)
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                if (!root) return;
                mindmap.add(root.id, "Yeni fikir");
                toast.success("Düğüm eklendi");
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Köke yeni düğüm
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                downloadText("mintmap.md", exportMarkdown(nodes), "text/markdown");
                toast.success("Markdown indirildi");
              })
            }
          >
            <Download className="mr-2 h-4 w-4" /> Markdown olarak dışa aktar
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                downloadText(
                  "mintmap-backup.json",
                  JSON.stringify(mindmap.getFullSnapshot(), null, 2),
                  "application/json",
                );
                toast.success("Yedek indirildi");
              })
            }
          >
            <Download className="mr-2 h-4 w-4" /> JSON yedek al
          </CommandItem>
          <CommandItem onSelect={() => run(importJson)}>
            <Upload className="mr-2 h-4 w-4" /> JSON yedek yükle
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                const root = document.documentElement;
                const dark = root.classList.toggle("dark");
                try {
                  localStorage.setItem("mintmap.theme", dark ? "dark" : "light");
                } catch {}
              })
            }
          >
            <Moon className="mr-2 h-4 w-4" /> Tema değiştir
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="AI">
          <CommandItem onSelect={() => run(() => setBulkOpen(true))}>
            <Sparkles className="mr-2 h-4 w-4" /> Çalışma alanını özetle
          </CommandItem>
          <CommandItem onSelect={() => run(() => setBulkOpen(true))}>
            <FileText className="mr-2 h-4 w-4" /> Haftalık rapor oluştur
          </CommandItem>
        </CommandGroup>
        {nodes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Düğümler">
              {nodes.slice(0, 50).map((n) => (
                <CommandItem
                  key={n.id}
                  value={`${n.title} ${(n.tags ?? []).join(" ")}`}
                  onSelect={() =>
                    run(() => {
                      navigate({ to: "/", hash: `node-${n.id}` });
                    })
                  }
                >
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: n.color }} />
                  {n.title}
                  {n.tags?.length ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {n.tags.map((t) => `#${t}`).join(" ")}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
    <BulkAIDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </>
  );
}
