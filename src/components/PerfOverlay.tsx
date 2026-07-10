import { useEffect, useRef, useState } from "react";

/**
 * Global counters incremented by MindmapCanvas to verify rAF throttling.
 *  - pointerMoves: raw pointer-move events received during a drag
 *  - dragFlushes:  rAF-coalesced store updates (mindmap.move calls)
 * If throttling works, flushes/sec should cap near the display refresh
 * rate (~60) while pointerMoves/sec can be much higher.
 */
export const perfCounters = {
  pointerMoves: 0,
  dragFlushes: 0,
};

type Stats = {
  fps: number;
  frameMs: number;
  longestMs: number;
  pps: number; // pointer events / sec
  fps_flush: number; // drag flushes / sec
};

export function PerfOverlay() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("mw:perf") === "1" ||
        new URLSearchParams(window.location.search).has("perf");
    } catch {
      return false;
    }
  });
  const [stats, setStats] = useState<Stats>({
    fps: 0, frameMs: 0, longestMs: 0, pps: 0, fps_flush: 0,
  });

  // Toggle with Shift+P
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "P" || e.key === "p")) {
        setVisible((v) => {
          const nv = !v;
          try { localStorage.setItem("mw:perf", nv ? "1" : "0"); } catch {}
          return nv;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const raf = useRef<number | null>(null);
  const lastT = useRef<number>(0);
  const acc = useRef({
    frames: 0,
    elapsed: 0,
    longest: 0,
    lastReportT: 0,
    pmStart: 0,
    fxStart: 0,
  });

  useEffect(() => {
    if (!visible) return;
    lastT.current = performance.now();
    acc.current.lastReportT = lastT.current;
    acc.current.pmStart = perfCounters.pointerMoves;
    acc.current.fxStart = perfCounters.dragFlushes;

    const tick = (t: number) => {
      const dt = t - lastT.current;
      lastT.current = t;
      acc.current.frames += 1;
      acc.current.elapsed += dt;
      if (dt > acc.current.longest) acc.current.longest = dt;

      const sinceReport = t - acc.current.lastReportT;
      if (sinceReport >= 500) {
        const fps = (acc.current.frames * 1000) / sinceReport;
        const frameMs = acc.current.elapsed / acc.current.frames;
        const pps = ((perfCounters.pointerMoves - acc.current.pmStart) * 1000) / sinceReport;
        const fps_flush = ((perfCounters.dragFlushes - acc.current.fxStart) * 1000) / sinceReport;
        setStats({
          fps: Math.round(fps),
          frameMs: Math.round(frameMs * 10) / 10,
          longestMs: Math.round(acc.current.longest * 10) / 10,
          pps: Math.round(pps),
          fps_flush: Math.round(fps_flush),
        });
        acc.current.frames = 0;
        acc.current.elapsed = 0;
        acc.current.longest = 0;
        acc.current.lastReportT = t;
        acc.current.pmStart = perfCounters.pointerMoves;
        acc.current.fxStart = perfCounters.dragFlushes;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [visible]);

  if (!visible) return null;

  const fpsColor =
    stats.fps >= 55 ? "text-emerald-400"
    : stats.fps >= 40 ? "text-amber-400"
    : "text-rose-400";
  // When dragging actively, flushes should be <= screen refresh while pps can spike higher.
  const throttleOk = stats.pps === 0 || stats.fps_flush <= stats.pps;

  return (
    <div
      className="pointer-events-auto absolute bottom-2 left-2 z-50 rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5 font-mono text-[11px] leading-tight shadow-md backdrop-blur"
      role="status"
      aria-label="Performance overlay"
    >
      <div className="flex items-center gap-2">
        <span className={fpsColor}>● {stats.fps} fps</span>
        <span className="text-muted-foreground">frame {stats.frameMs}ms</span>
        <span className="text-muted-foreground">max {stats.longestMs}ms</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="text-muted-foreground">pointer {stats.pps}/s</span>
        <span className={throttleOk ? "text-emerald-400" : "text-rose-400"}>
          flush {stats.fps_flush}/s {throttleOk ? "✓" : "✗"}
        </span>
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground/70">Shift+P to toggle</div>
    </div>
  );
}
