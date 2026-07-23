import { Link, useRouterState } from "@tanstack/react-router";
import { Network, ListChecks, CalendarDays, Columns3, LayoutGrid, Activity } from "lucide-react";

const items = [
  { to: "/", label: "Mindmap", icon: Network },
  { to: "/todos", label: "Görevler", icon: ListChecks },
  { to: "/pulse", label: "Pulse", icon: Activity },
  { to: "/keep", label: "Kutu", icon: LayoutGrid },
  { to: "/board", label: "Pano", icon: Columns3 },
  { to: "/calendar", label: "Takvim", icon: CalendarDays },
] as const;

export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="z-20 flex shrink-0 items-center justify-around border-t border-border/60 bg-card/80 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur">
      {items.map((it) => {
        const active = path === it.to;
        const Icon = it.icon;
        return (
          <Link
            key={it.to}
            to={it.to}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors ${
              active ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <div
              className={`flex h-9 w-14 items-center justify-center rounded-full transition-all ${
                active ? "bg-primary/15" : ""
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
