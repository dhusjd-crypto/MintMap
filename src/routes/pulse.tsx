import { createFileRoute } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { PulseList } from "@/components/PulseList";

export const Route = createFileRoute("/pulse")({
  head: () => ({
    meta: [{ title: "MintMap — Pulse" }],
  }),
  component: PulseScreen,
});

function PulseScreen() {
  return (
    <main className="relative flex h-svh w-full flex-col">
      <header className="z-10 px-5 pt-5 pb-3">
        <h1 className="text-lg font-bold leading-none">Pulse</h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">İlgi alanlarındaki gelişmeler</p>
      </header>
      <div className="flex-1 overflow-y-auto">
        <PulseList />
      </div>
      <BottomNav />
    </main>
  );
}
