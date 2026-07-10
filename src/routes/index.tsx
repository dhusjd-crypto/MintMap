import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { BottomNav } from "@/components/BottomNav";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { useNodes, useReminderScheduler } from "@/lib/mindmap-store";
import mintLogo from "@/assets/mint-logo.png.asset.json";

// Heavy canvas + sheet are split out of the route's critical chunk so the
// header / shell can paint while the canvas hydrates.
const MindmapCanvas = lazy(() =>
  import("@/components/MindmapCanvas").then((m) => ({ default: m.MindmapCanvas })),
);
const NodeSheet = lazy(() =>
  import("@/components/NodeSheet").then((m) => ({ default: m.NodeSheet })),
);


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MintMap — Mindmap, notlar ve görevler" },
      {
        name: "description",
        content:
          "Fikirlerini mindmap olarak büyüt; her dalın altına notlar, alt görevler, görseller ve hatırlatıcılar ekle.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const nodes = useNodes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetTab, setSheetTab] = useState<"note" | "todo" | "extra">("note");
  useReminderScheduler();

  const root = nodes.find((n) => n.parentId === null);
  const doneCount = nodes.reduce(
    (acc, n) => acc + n.todos.filter((t) => t.done).length,
    0,
  );
  const totalCount = nodes.reduce((acc, n) => acc + n.todos.length, 0);

  return (
    <main className="relative flex h-svh w-full flex-col">
      <header className="z-10 flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card shadow-soft overflow-hidden">
            <img
              src={mintLogo.url}
              alt="Mint"
              className="h-7 w-7 object-contain"
              width={28}
              height={28}
              decoding="async"
              fetchPriority="high"
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-none">MintMap</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {root?.title ?? "Mindmap"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <WorkspaceSwitcher />
          {totalCount > 0 && (
            <Link
              to="/todos"
              className="rounded-full bg-card px-3 py-1.5 text-xs font-medium shadow-soft transition-colors hover:bg-primary/10"
              aria-label="Görevlere git"
            >
              {doneCount}/{totalCount}
            </Link>
          )}
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div
              className="flex h-full w-full items-center justify-center text-xs text-muted-foreground"
              aria-busy="true"
              aria-live="polite"
            >
              Mindmap yükleniyor…
            </div>
          }
        >
          <MindmapCanvas
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpenSheet={(id) => {
              setSheetId(id);
              setSheetTab("note");
            }}
            onOpenTodoSheet={(id) => {
              setSheetId(id);
              setSheetTab("todo");
            }}
          />
        </Suspense>
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-muted-foreground">
          Dokun · Sürükle · Uzun bas
        </div>
      </div>

      <BottomNav />
      <Suspense fallback={null}>
        <NodeSheet nodeId={sheetId} onClose={() => setSheetId(null)} initialTab={sheetTab} />
      </Suspense>
      <Toaster position="top-center" />
    </main>
  );
}
