import type { MindNode } from "@/lib/mindmap-store";

type Props = {
  nodes: MindNode[];
  viewport: { w: number; h: number };
  pan: { x: number; y: number };
  scale: number;
  onRecenter: (x: number, y: number) => void;
};

export function Minimap({ nodes, viewport, pan, scale, onRecenter }: Props) {
  if (nodes.length === 0 || viewport.w === 0) return null;
  const PAD = 80;
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const vxMin = -pan.x / scale - viewport.w / (2 * scale);
  const vxMax = -pan.x / scale + viewport.w / (2 * scale);
  const vyMin = -pan.y / scale - viewport.h / (2 * scale);
  const vyMax = -pan.y / scale + viewport.h / (2 * scale);
  const minX = Math.min(...xs, vxMin) - PAD;
  const maxX = Math.max(...xs, vxMax) + PAD;
  const minY = Math.min(...ys, vyMin) - PAD;
  const maxY = Math.max(...ys, vyMax) + PAD;
  const W = 128;
  const H = 88;
  const sx = W / (maxX - minX);
  const sy = H / (maxY - minY);
  const s = Math.min(sx, sy);
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  const project = (x: number, y: number) => ({
    x: (x - minX) * s + ox,
    y: (y - minY) * s + oy,
  });

  const handleTap = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const wx = (px - ox) / s + minX;
    const wy = (py - oy) / s + minY;
    onRecenter(wx, wy);
  };

  const vp = {
    a: project(vxMin, vyMin),
    b: project(vxMax, vyMax),
  };

  return (
    <div
      data-testid="minimap"
      className="absolute right-3 top-3 rounded-xl bg-card/85 p-1 shadow-soft backdrop-blur"
      data-export-hide="true"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <svg
        width={W}
        height={H}
        onClick={handleTap}
        className="cursor-pointer rounded-lg"
        style={{ background: "var(--color-muted)" }}
      >
        {nodes.map((n) => {
          const p = project(n.x, n.y);
          const parent = n.parentId ? nodes.find((x) => x.id === n.parentId) : null;
          const a = parent ? project(parent.x, parent.y) : null;
          return (
            <g key={n.id}>
              {a && (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={p.x}
                  y2={p.y}
                  stroke="var(--color-leaf)"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={n.parentId ? 2.5 : 4}
                fill={n.parentId ? n.color : "var(--color-primary)"}
              />
            </g>
          );
        })}
        <rect
          x={vp.a.x}
          y={vp.a.y}
          width={Math.max(2, vp.b.x - vp.a.x)}
          height={Math.max(2, vp.b.y - vp.a.y)}
          fill="var(--color-primary)"
          fillOpacity={0.12}
          stroke="var(--color-primary)"
          strokeWidth={1}
          rx={2}
        />
      </svg>
    </div>
  );
}
