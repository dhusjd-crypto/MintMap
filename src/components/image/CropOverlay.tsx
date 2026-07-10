import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const CROP_RATIOS: Array<{ id: string; label: string; ratio: number | null }> = [
  { id: "free", label: "Serbest", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

export function fitRectToRatio(
  rect: { x: number; y: number; w: number; h: number },
  ratio: number,
  pxRatio: number,
) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let h = rect.h;
  let w = (h * ratio) / pxRatio;
  if (w > 1) {
    w = 1;
    h = (w * pxRatio) / ratio;
  }
  if (h > 1) {
    h = 1;
    w = (h * ratio) / pxRatio;
  }
  const x = Math.min(1 - w, Math.max(0, cx - w / 2));
  const y = Math.min(1 - h, Math.max(0, cy - h / 2));
  return { x, y, w, h };
}

type Props = {
  src: string;
  aspectCls: string;
  onCancel: () => void;
  onApply: (rect: { x: number; y: number; w: number; h: number }) => void;
};

export function CropOverlay({ src, aspectCls, onCancel, onApply }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [ratioId, setRatioId] = useState<string>("free");
  const ratio = CROP_RATIOS.find((r) => r.id === ratioId)?.ratio ?? null;
  const [pxRatio, setPxRatio] = useState(1);

  useEffect(() => {
    const r = boxRef.current?.getBoundingClientRect();
    if (r && r.height > 0) setPxRatio(r.width / r.height);
  }, [aspectCls]);

  useEffect(() => {
    if (ratio == null) return;
    setRect((cur) => fitRectToRatio(cur, ratio, pxRatio));
  }, [ratio, pxRatio]);

  const dragRef = useRef<
    | null
    | {
        kind: "move" | "tl" | "tr" | "bl" | "br";
        startX: number;
        startY: number;
        orig: typeof rect;
      }
  >(null);

  const onPointerDown =
    (kind: "move" | "tl" | "tr" | "bl" | "br") => (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = { kind, startX: e.clientX, startY: e.clientY, orig: rect };
    };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const box = boxRef.current;
    if (!d || !box) return;
    const r = box.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / r.width;
    const dy = (e.clientY - d.startY) / r.height;
    let { x, y, w, h } = d.orig;
    if (d.kind === "move") {
      x = Math.min(1 - w, Math.max(0, x + dx));
      y = Math.min(1 - h, Math.max(0, y + dy));
    } else {
      if (d.kind === "tl") {
        x = Math.min(d.orig.x + d.orig.w - 0.05, Math.max(0, d.orig.x + dx));
        y = Math.min(d.orig.y + d.orig.h - 0.05, Math.max(0, d.orig.y + dy));
        w = d.orig.x + d.orig.w - x;
        h = d.orig.y + d.orig.h - y;
      } else if (d.kind === "tr") {
        y = Math.min(d.orig.y + d.orig.h - 0.05, Math.max(0, d.orig.y + dy));
        w = Math.min(1 - d.orig.x, Math.max(0.05, d.orig.w + dx));
        h = d.orig.y + d.orig.h - y;
      } else if (d.kind === "bl") {
        x = Math.min(d.orig.x + d.orig.w - 0.05, Math.max(0, d.orig.x + dx));
        w = d.orig.x + d.orig.w - x;
        h = Math.min(1 - d.orig.y, Math.max(0.05, d.orig.h + dy));
      } else {
        w = Math.min(1 - d.orig.x, Math.max(0.05, d.orig.w + dx));
        h = Math.min(1 - d.orig.y, Math.max(0.05, d.orig.h + dy));
      }
      if (ratio != null) {
        const desiredHnorm = (w * pxRatio) / ratio;
        const anchor = d.kind;
        const newH = Math.min(1, desiredHnorm);
        const newW = (newH * ratio) / pxRatio;
        if (anchor === "tl" || anchor === "tr") {
          const bottom = d.orig.y + d.orig.h;
          y = Math.max(0, bottom - newH);
          h = bottom - y;
          w = (h * ratio) / pxRatio;
        } else {
          y = d.orig.y;
          h = newH;
          w = newW;
        }
        if (anchor === "tl" || anchor === "bl") {
          const right = d.orig.x + d.orig.w;
          x = Math.max(0, right - w);
          w = right - x;
        } else {
          x = d.orig.x;
        }
      }
    }
    setRect({ x, y, w, h });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={boxRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={cn(
        "relative h-full w-full select-none touch-none",
        aspectCls || "min-h-[200px]",
      )}
    >
      <img
        src={src}
        alt=""
        className="pointer-events-none h-full w-full object-contain"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-0 right-0 top-0 bg-bark/60"
          style={{ height: `${rect.y * 100}%` }}
        />
        <div
          className="absolute left-0 right-0 bottom-0 bg-bark/60"
          style={{ height: `${(1 - rect.y - rect.h) * 100}%` }}
        />
        <div
          className="absolute left-0 bg-bark/60"
          style={{
            top: `${rect.y * 100}%`,
            height: `${rect.h * 100}%`,
            width: `${rect.x * 100}%`,
          }}
        />
        <div
          className="absolute right-0 bg-bark/60"
          style={{
            top: `${rect.y * 100}%`,
            height: `${rect.h * 100}%`,
            width: `${(1 - rect.x - rect.w) * 100}%`,
          }}
        />
      </div>
      <div
        onPointerDown={onPointerDown("move")}
        className="absolute cursor-move border-2 border-primary"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
        }}
      >
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <div
            key={c}
            onPointerDown={onPointerDown(c)}
            className={cn(
              "absolute h-3 w-3 rounded-sm border-2 border-primary bg-card",
              c === "tl" && "-left-1.5 -top-1.5 cursor-nwse-resize",
              c === "tr" && "-right-1.5 -top-1.5 cursor-nesw-resize",
              c === "bl" && "-left-1.5 -bottom-1.5 cursor-nesw-resize",
              c === "br" && "-right-1.5 -bottom-1.5 cursor-nwse-resize",
            )}
          />
        ))}
      </div>

      <div className="absolute left-1/2 top-2 flex -translate-x-1/2 flex-wrap justify-center gap-1 rounded-full bg-card/95 p-1 shadow-soft">
        {CROP_RATIOS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRatioId(r.id)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              ratioId === r.id
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        <button
          onClick={onCancel}
          className="rounded-full bg-card/95 px-3 py-1 text-[11px] font-semibold shadow-soft"
        >
          İptal
        </button>
        <button
          onClick={() => onApply(rect)}
          className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-soft"
        >
          Kırp
        </button>
      </div>
    </div>
  );
}
