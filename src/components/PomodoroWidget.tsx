import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, RotateCcw, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { useFabSlot } from "@/lib/fab-slots";


type Mode = "focus" | "break";

const FOCUS_MIN = 25;
const BREAK_MIN = 5;

export function PomodoroWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(FOCUS_MIN * 60);
  const [running, setRunning] = useState(false);
  const [completedFocus, setCompletedFocus] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick
  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          // switch mode
          const nextMode: Mode = mode === "focus" ? "break" : "focus";
          if (mode === "focus") setCompletedFocus((c) => c + 1);
          if (typeof window !== "undefined") {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(nextMode === "break" ? "🍅 Mola zamanı" : "🌿 Odaklanma zamanı", {
                body: nextMode === "break" ? "5 dk mola al." : "25 dk odaklan.",
              });
            }
            toast.success(
              nextMode === "break" ? "🍅 Mola! 5 dk dinlen." : "🌿 Yeni odaklanma turu",
            );
          }
          setMode(nextMode);
          return (nextMode === "focus" ? FOCUS_MIN : BREAK_MIN) * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, mode]);

  const total = (mode === "focus" ? FOCUS_MIN : BREAK_MIN) * 60;
  const pct = 1 - remaining / total;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  const reset = () => {
    setRunning(false);
    setRemaining(total);
  };

  const handleToggleRun = () => {
    if (!running && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setRunning((v) => !v);
  };

  // Right side, priority 3 — sits above AI launcher (priority 2).
  const slot = useFabSlot({
    id: "pomodoro",
    preferredSide: "right",
    height: 48,
    width: 48,
    priority: 3,
  });
  const sideClass = slot.side === "right" ? "right-4" : "left-4";

  return (

    <div
      data-fab-id="pomodoro"
      data-fab-side={slot.side}
      className={`layer-fab fixed ${sideClass}`}
      style={{ bottom: `calc(${slot.bottom}px + env(safe-area-inset-bottom))` }}
    >
      <AnimatePresence>

        {open ? (
          <motion.div
            key="open"
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            className="w-56 rounded-2xl border border-border bg-card p-3 shadow-leaf"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Timer className="h-3.5 w-3.5" />
                {mode === "focus" ? "Odaklan" : "Mola"}
              </div>
              <button onClick={() => setOpen(false)} aria-label="Kapat">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="relative my-2 flex h-24 w-24 items-center justify-center self-center mx-auto">
              <svg viewBox="0 0 36 36" className="absolute inset-0">
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="var(--color-muted)"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke={mode === "focus" ? "var(--color-primary)" : "var(--color-accent)"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${pct * 100} 100`}
                  transform="rotate(-90 18 18)"
                  style={{ transition: "stroke-dasharray 1s linear" }}
                />
              </svg>
              <div className="text-xl font-bold tabular-nums">
                {mm}:{ss}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleToggleRun}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft"
                aria-label={running ? "Duraklat" : "Başlat"}
              >
                {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                onClick={reset}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground"
                aria-label="Sıfırla"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 text-center text-[11px] text-muted-foreground">
              Bugün {completedFocus} 🍅 tamamlandı
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="closed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setOpen(true)}
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-leaf ${
              running ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
            }`}
            aria-label="Pomodoro"
            title={running ? `${mm}:${ss}` : "Pomodoro"}
          >
            {running ? (
              <span className="text-[10px] font-bold tabular-nums">{mm}:{ss}</span>
            ) : (
              <Timer className="h-5 w-5" />
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
