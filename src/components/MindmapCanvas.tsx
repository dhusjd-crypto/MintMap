import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useSavedNodeId } from "@/lib/save-feedback";
import {
  ClipboardList,
  Plus,
  Search,
  Trash2,
  X,
  Undo2,
  Redo2,
  Move,
} from "lucide-react";
import { toast } from "sonner";
// Lazy-imported on demand inside handlePngExport to keep it out of the
// initial canvas bundle.

import { driveLoadSnapshot, driveSaveSnapshot } from "@/lib/google/drive";
import { mindmap, useNodes, type MindNode } from "@/lib/mindmap-store";
import { readBackupPayload, shouldAllowCloudSave, describeStoreSnapshot } from "@/lib/backup-format";
import { useFabSlot } from "@/lib/fab-slots";
import { TEMPLATES } from "@/lib/templates";
import { customTemplates, subtreeAsTemplateNodes } from "@/lib/custom-templates";
import { PerfOverlay, perfCounters } from "@/components/PerfOverlay";
import { Minimap } from "@/components/mindmap/Minimap";
import { MindmapToolbar } from "@/components/mindmap/MindmapToolbar";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenSheet: (id: string) => void;
  onOpenTodoSheet?: (id: string) => void;
};

const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;
const WORLD = 10000;

function importBackupSnapshot(parsed: unknown) {
  const backup = readBackupPayload(parsed);
  if (backup.kind === "legacy") mindmap.importSnapshot(backup.nodes);
  else mindmap.importFullSnapshot(backup.store);
  return backup.summary;
}

export function MindmapCanvas({ selectedId, onSelect, onOpenSheet, onOpenTodoSheet }: Props) {
  const nodes = useNodes();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const dragNode = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number; midX: number; midY: number; panX: number; panY: number } | null>(null);
  // rAF coalescer for drag-move — collapses many pointermove events into one
  // store mutation per frame so all NodeButtons re-render at most ~60 fps.
  const dragRaf = useRef<number | null>(null);
  const dragPending = useRef<{ id: string; x: number; y: number } | null>(null);
  const flushDrag = () => {
    dragRaf.current = null;
    const p = dragPending.current;
    if (!p) return;
    dragPending.current = null;
    perfCounters.dragFlushes += 1;
    mindmap.move(p.id, p.x, p.y);
  };


  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = containerRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      mindmap.commitMove();
      setLastSavedAt(Date.now());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const originX = size.w / 2 + pan.x;
  const originY = size.h / 2.6 + pan.y;

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setScale((prev) => {
      const next = clampScale(prev * factor);
      const ratio = next / prev;
      setPan((p) => ({
        x: cx - (cx - (size.w / 2 + p.x)) * ratio - size.w / 2,
        y: cy - (cy - (size.h / 2.6 + p.y)) * ratio - size.h / 2.6,
      }));
      return next;
    });
  };

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (pointers.current.size === 2) {
      panStart.current = null;
      dragNode.current = null;
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = {
        dist: dist(a, b),
        scale,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    if (e.target === e.currentTarget) {
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchStart.current && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const newDist = dist(a, b);
      const factor = newDist / pinchStart.current.dist;
      const nextScale = clampScale(pinchStart.current.scale * factor);
      const ratio = nextScale / pinchStart.current.scale;
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = pinchStart.current.midX - rect.left;
      const my = pinchStart.current.midY - rect.top;
      const ox0 = size.w / 2 + pinchStart.current.panX;
      const oy0 = size.h / 2.6 + pinchStart.current.panY;
      const newPanX = mx - (mx - ox0) * ratio - size.w / 2;
      const newPanY = my - (my - oy0) * ratio - size.h / 2.6;
      setScale(nextScale);
      setPan({ x: newPanX, y: newPanY });
      return;
    }

    if (dragNode.current) {
      perfCounters.pointerMoves += 1;
      const rect = containerRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      dragPending.current = {
        id: dragNode.current.id,
        x: (sx - originX) / scale - dragNode.current.offsetX,
        y: (sy - originY) / scale - dragNode.current.offsetY,
      };
      if (dragRaf.current === null) {
        dragRaf.current = requestAnimationFrame(flushDrag);
      }
      return;
    }


    if (panStart.current) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.x),
        y: panStart.current.py + (e.clientY - panStart.current.y),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (dragNode.current) {
      // Flush any pending move so final position is committed before persist.
      if (dragRaf.current !== null) {
        cancelAnimationFrame(dragRaf.current);
        dragRaf.current = null;
        flushDrag();
      }
      mindmap.commitMove();
    }
    dragNode.current = null;
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;

  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(factor, cx, cy);
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setScale(1);
  };

  const byId = useMemo(() => {
    const m = new Map<string, MindNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);
  const childrenByParent = useMemo(() => {
    const m = new Map<string, MindNode[]>();
    nodes.forEach((n) => {
      if (!n.parentId) return;
      const arr = m.get(n.parentId);
      if (arr) arr.push(n);
      else m.set(n.parentId, [n]);
    });
    return m;
  }, [nodes]);
  const selectedNode = selectedId ? byId.get(selectedId) ?? null : null;

  // Register the mindmap context FAB cluster (bottom-right) so global
  // FABs (AI, Pomodoro) stack ABOVE it instead of overlapping. The
  // cluster grows as buttons appear: Plus (56) is always rendered,
  // Görev (44+gap) when a node is selected, Sil (44+gap) when a
  // non-root node is selected.
  const hasTaskBtn = !!selectedNode && !!onOpenTodoSheet;
  const hasDeleteBtn = !!selectedNode && !!selectedNode.parentId;
  const contextHeight =
    56 + (hasTaskBtn ? 48 + 12 : 0) + (hasDeleteBtn ? 48 + 12 : 0);
  const contextSlot = useFabSlot({
    id: "mindmap-context",
    preferredSide: "right",
    height: contextHeight,
    width: 56,
    priority: 0,
  });




  // Keyboard a11y state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [liveMsg, setLiveMsg] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  // A node is hidden if any ancestor is collapsed.
  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>();
    const walk = (id: string) => {
      (childrenByParent.get(id) ?? []).forEach((c) => {
        hidden.add(c.id);
        walk(c.id);
      });
    };
    collapsedIds.forEach((id) => walk(id));
    return hidden;
  }, [collapsedIds, childrenByParent]);

  // Viewport culling: only render nodes whose world position is inside the
  // visible viewport (plus padding). Massive win on large mindmaps where
  // most nodes are off-screen. Returns null when size is not measured yet
  // (initial mount) so we render everything in that frame.
  const visibleIds = useMemo(() => {
    if (size.w === 0 || size.h === 0) return null as Set<string> | null;
    const pad = 280;
    const minX = (0 - originX) / scale - pad;
    const maxX = (size.w - originX) / scale + pad;
    const minY = (0 - originY) / scale - pad;
    const maxY = (size.h - originY) / scale + pad;
    const set = new Set<string>();
    for (const n of nodes) {
      if (hiddenIds.has(n.id)) continue;
      if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) set.add(n.id);
    }
    return set;
  }, [nodes, hiddenIds, originX, originY, scale, size.w, size.h]);
  const isVisible = (id: string) => !visibleIds || visibleIds.has(id);

  const isCollapsed = (id: string) => collapsedIds.has(id);
  const hasChildren = (id: string) => (childrenByParent.get(id)?.length ?? 0) > 0;

  const toggleCollapse = (id: string, force?: boolean) => {
    if (!hasChildren(id)) return;
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      const want = force ?? !next.has(id);
      if (want) next.add(id);
      else next.delete(id);
      const n = byId.get(id);
      setLiveMsg(want ? `${n?.title ?? "Düğüm"} daraltıldı` : `${n?.title ?? "Düğüm"} genişletildi`);
      return next;
    });
  };

  const depthOf = (id: string): number => {
    let d = 1;
    let cur = byId.get(id);
    while (cur?.parentId) {
      d += 1;
      cur = byId.get(cur.parentId);
    }
    return d;
  };

  const announceSelect = (id: string) => {
    const n = byId.get(id);
    if (!n) return;
    const kids = childrenByParent.get(id)?.length ?? 0;
    setLiveMsg(`${n.title} seçildi${kids ? `, ${kids} alt dal` : ""}`);
  };

  const nearestInDirection = (fromId: string, dir: "left" | "right" | "up" | "down"): string | null => {
    const from = byId.get(fromId);
    if (!from) return null;
    let best: { id: string; score: number } | null = null;
    for (const n of nodes) {
      if (n.id === fromId) continue;
      if (hiddenIds.has(n.id)) continue;
      const dx = n.x - from.x;
      const dy = n.y - from.y;
      const ok =
        (dir === "right" && dx > 0 && Math.abs(dx) >= Math.abs(dy)) ||
        (dir === "left" && dx < 0 && Math.abs(dx) >= Math.abs(dy)) ||
        (dir === "down" && dy > 0 && Math.abs(dy) >= Math.abs(dx)) ||
        (dir === "up" && dy < 0 && Math.abs(dy) >= Math.abs(dx));
      if (!ok) continue;
      const score = Math.hypot(dx, dy);
      if (!best || score < best.score) best = { id: n.id, score };
    }
    return best?.id ?? null;
  };

  const selectAndAnnounce = (id: string) => {
    onSelect(id);
    announceSelect(id);
  };

  // Focus mode — highlight selected node's branch (ancestors + descendants)
  const [focusMode, setFocusMode] = useState(true);
  const focusIds = useMemo(() => {
    if (!focusMode || !selectedId) return null as Set<string> | null;
    const set = new Set<string>();
    let cur: MindNode | undefined = byId.get(selectedId);
    while (cur) {
      set.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    const queue = [selectedId];
    while (queue.length) {
      const id = queue.shift()!;
      (childrenByParent.get(id) ?? []).forEach((c) => {
        if (!set.has(c.id)) {
          set.add(c.id);
          queue.push(c.id);
        }
      });
    }
    return set;
  }, [focusMode, selectedId, byId, childrenByParent]);

  // Link mode: tap two nodes to create/remove a free connection
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  useEffect(() => {
    if (!linkMode) setLinkSource(null);
  }, [linkMode]);

  // Reparent mode: tap source node, then tap target node to make target its new parent
  const [reparentMode, setReparentMode] = useState(false);
  const [reparentSource, setReparentSource] = useState<string | null>(null);
  useEffect(() => {
    if (!reparentMode) setReparentSource(null);
    else setLinkMode(false);
  }, [reparentMode]);
  useEffect(() => {
    if (linkMode) setReparentMode(false);
  }, [linkMode]);

  // `NodeButton` is memo()'d, but that was dead weight while every handler was
  // an inline arrow: fresh identities each render meant all ~600 nodes
  // re-rendered on every pointermove of a drag (measured: ~900ms frozen).
  // The handlers below are stable, and read volatile state through this ref
  // instead of closing over it.
  const liveRef = useRef({
    linkMode, linkSource, reparentMode, reparentSource, nodes,
    originX, originY, scale,
  });
  liveRef.current = {
    linkMode, linkSource, reparentMode, reparentSource, nodes,
    originX, originY, scale,
  };
  const toggleCollapseRef = useRef(toggleCollapse);
  toggleCollapseRef.current = toggleCollapse;
  const callbacksRef = useRef({ onSelect, onOpenSheet });
  callbacksRef.current = { onSelect, onOpenSheet };

  const handleToggleCollapse = useCallback((id: string) => {
    toggleCollapseRef.current(id);
  }, []);

  const handleCancelEdit = useCallback(() => setEditingId(null), []);

  const handleCommitEdit = useCallback((id: string, title: string) => {
    const t = title.trim();
    const node = liveRef.current.nodes.find((x) => x.id === id);
    if (t && t !== node?.title) {
      mindmap.update(id, { title: t });
      setLiveMsg(`Yeniden adlandırıldı: ${t}`);
    }
    setEditingId(null);
  }, []);

  const handleStartDrag = useCallback(
    (e: React.PointerEvent, pos: { x: number; y: number }, id: string) => {
      const { originX: ox, originY: oy, scale: sc } = liveRef.current;
      const rect = containerRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      dragNode.current = {
        id,
        offsetX: (sx - ox) / sc - pos.x,
        offsetY: (sy - oy) / sc - pos.y,
      };
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleTap = useCallback((id: string) => {
    const { linkMode: lm, linkSource: ls, reparentMode: rm, reparentSource: rs, nodes: ns } =
      liveRef.current;

    if (lm) {
      if (!ls) {
        setLinkSource(id);
        toast("Şimdi bağlanacak ikinci düğüme dokun");
      } else if (ls === id) {
        setLinkSource(null);
      } else {
        mindmap.toggleLink(ls, id);
        const a = ns.find((x) => x.id === ls);
        const b = ns.find((x) => x.id === id);
        const existed = a?.links?.includes(id);
        toast.success(existed ? "Bağlantı kaldırıldı" : `🔗 ${a?.title} ↔ ${b?.title}`);
        setLinkSource(null);
      }
      return;
    }

    if (rm) {
      if (!rs) {
        const src = ns.find((x) => x.id === id);
        if (!src || src.parentId === null) {
          toast.error("Kök düğüm taşınamaz");
          return;
        }
        setReparentSource(id);
        toast("Yeni üst düğüme dokun");
      } else if (rs === id) {
        setReparentSource(null);
      } else {
        const ok = mindmap.setParent(rs, id);
        const a = ns.find((x) => x.id === rs);
        const b = ns.find((x) => x.id === id);
        if (ok) toast.success(`↳ ${a?.title} → ${b?.title}`);
        else toast.error("Geçersiz hedef (döngü veya aynı üst)");
        setReparentSource(null);
      }
      return;
    }

    callbacksRef.current.onSelect(id);
    callbacksRef.current.onOpenSheet(id);
  }, []);

  // Keyboard undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (mindmap.canUndo()) {
          mindmap.undo();
          toast("↶ Geri alındı", { duration: 1000 });
        }
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (mindmap.canRedo()) {
          mindmap.redo();
          toast("↷ Yinelendi", { duration: 1000 });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  // Search & focus
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const matchedIds = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return null as Set<string> | null;
    const m = new Set<string>();
    nodes.forEach((n) => {
      const inTitle = n.title.toLowerCase().includes(q);
      const inNote = (n.note ?? "").toLowerCase().includes(q);
      const inTags = (n.tags ?? []).some((t) => t.toLowerCase().includes(q));
      const inTodos = n.todos.some(
        (t) =>
          t.text.toLowerCase().includes(q) ||
          (t.tags ?? []).some((x) => x.toLowerCase().includes(q)),
      );
      if (inTitle || inNote || inTags || inTodos) m.add(n.id);
    });
    return m;
  }, [nodes, searchQ]);

  const focusOnNode = (n: MindNode) => {
    setPan({ x: -n.x * scale, y: -n.y * scale });
  };

  // §12–13: after a save, bring the affected node into view (zoom preserved)
  // and flash it so the user sees what changed. Only pans when the node is
  // actually off-screen, so a visible node doesn't jump under the user.
  const savedNodeId = useSavedNodeId();
  useEffect(() => {
    if (!savedNodeId) return;
    const n = byId.get(savedNodeId);
    if (!n || !size.w || !size.h) return;
    const sx = n.x * scale + pan.x + size.w / 2;
    const sy = n.y * scale + pan.y + size.h / 2;
    const margin = 80;
    const offscreen =
      sx < margin || sy < margin || sx > size.w - margin || sy > size.h - margin;
    if (offscreen) focusOnNode(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedNodeId]);

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const handleApplyTemplate = (id: string) => {
    const custom = customTemplates.list().find((t) => t.id === id);
    const tpl = custom ?? TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    const parentId = selectedId ?? nodes.find((n) => n.parentId === null)?.id;
    if (!parentId) return;
    mindmap.applyTemplate(parentId, tpl.nodes);
    toast.success(`${tpl.emoji} ${tpl.name} eklendi`);
    setTemplatesOpen(false);
  };
  const handleSaveNodeAsTemplate = (name: string, emoji: string) => {
    if (!selectedId) return;
    const kids = subtreeAsTemplateNodes(nodes, selectedId);
    if (!kids.length) {
      toast.error("Bu düğümün alt dalı yok");
      return;
    }
    customTemplates.save({ name, emoji, nodes: kids });
    toast.success(`${emoji} ${name} kaydedildi`);
  };

  const handlePngExport = async () => {
    if (!containerRef.current) return;
    const t = toast.loading("PNG dışa aktarılıyor...");
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(containerRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue("--background")
          .trim() || "#ffffff",
        filter: (el: HTMLElement) => {
          const a = el.getAttribute?.("data-export-hide");
          return a !== "true";
        },
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `mindmap-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("PNG indirildi", { id: t });
    } catch (e) {
      toast.error("PNG hatası: " + (e as Error).message, { id: t });
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedNode) return;
    if (selectedNode.parentId === null) {
      toast.error("Kök düğüm silinemez");
      return;
    }
    // No confirm() — it's silently blocked in installed PWAs. Deleting is
    // undoable, so delete immediately and offer the undo in the toast.
    const title = selectedNode.title;
    mindmap.remove(selectedNode.id);
    toast.success(`'${title}' silindi`, {
      action: { label: "Geri al", onClick: () => mindmap.undo() },
    });
  };

  const saveToDrive = driveSaveSnapshot;
  const loadFromDrive = driveLoadSnapshot;

  const handleDriveSave = async () => {
    const t = toast.loading("Drive'a kaydediliyor...");
    try {
      const snapshot = await mindmap.getPortableSnapshot();
      if (!shouldAllowCloudSave(snapshot)) {
        toast.error("Varsayılan boş veri Drive'a yazılmadı. Önce Drive'dan yükle.", { id: t });
        return;
      }
      await saveToDrive({ data: { json: JSON.stringify(snapshot) } });
      toast.success(`Drive'a kaydedildi (${describeStoreSnapshot(snapshot)})`, { id: t });
    } catch (e) {
      toast.error("Drive kaydı başarısız: " + (e as Error).message, { id: t });
    }
  };

  const handleDriveLoad = async () => {
    // Heavyweight replace — worth an explicit confirm, but confirm() is dead
    // in installed PWAs, so ask via a toast action instead.
    toast("Drive'daki veriyle değiştirilsin mi?", {
      description: "Mevcut haritanın yerine Drive'daki yedek gelir (geri alınabilir).",
      action: { label: "Değiştir", onClick: () => void doDriveLoad() },
      cancel: { label: "Vazgeç", onClick: () => {} },
      duration: 10000,
    });
  };

  const doDriveLoad = async () => {
    const t = toast.loading("Drive'dan yükleniyor...");
    try {
      const res = await loadFromDrive();
      if (!res.json) {
        toast.error("Drive'da kayıt bulunamadı", { id: t });
        return;
      }
      const parsed = JSON.parse(res.json);
      const backup = readBackupPayload(parsed);
      if (backup.isDefaultSeed) {
        toast.error("Drive'daki yedek varsayılan boş veri. Telefonda sayfayı yenileyip tekrar Drive'a kaydet.", { id: t });
        return;
      }
      const summary = importBackupSnapshot(parsed);
      toast.success(`Drive'dan yüklendi (${summary})`, { id: t });
    } catch (e) {
      toast.error("Yükleme başarısız: " + (e as Error).message, { id: t });
    }
  };

  const handleAddChildSelected = () => {
    const parentId = selectedId ?? nodes.find((n) => n.parentId === null)?.id;
    if (!parentId) return;
    const c = mindmap.add(parentId);
    onSelect(c.id);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Don't hijack typing in inputs/textareas (inline rename uses its own handler).
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (editingId) return;

    const root = nodes.find((n) => !n.parentId);
    const curId = selectedId ?? root?.id;
    if (!curId) return;
    const cur = byId.get(curId);
    if (!cur) return;

    const arrows: Record<string, "left" | "right" | "up" | "down"> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    if (arrows[e.key]) {
      e.preventDefault();
      // WAI-ARIA tree pattern: ArrowRight expands a collapsed parent;
      // ArrowLeft collapses an expanded parent (or moves to parent if leaf).
      if (e.key === "ArrowRight" && hasChildren(curId) && isCollapsed(curId)) {
        toggleCollapse(curId, false);
        return;
      }
      if (e.key === "ArrowLeft" && hasChildren(curId) && !isCollapsed(curId)) {
        toggleCollapse(curId, true);
        return;
      }
      const next = nearestInDirection(curId, arrows[e.key]);
      if (next) selectAndAnnounce(next);
      return;
    }
    if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      toggleCollapse(curId);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (cur.parentId) selectAndAnnounce(cur.parentId);
      } else {
        const kids = childrenByParent.get(curId) ?? [];
        if (kids.length) selectAndAnnounce(kids[0].id);
        else if (cur.parentId) {
          const sib = childrenByParent.get(cur.parentId) ?? [];
          const i = sib.findIndex((s) => s.id === curId);
          if (i >= 0 && sib[i + 1]) selectAndAnnounce(sib[i + 1].id);
        }
      }
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      if (root) selectAndAnnounce(root.id);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      onOpenSheet(curId);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      onOpenTodoSheet?.(curId);
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      setEditingId(curId);
      return;
    }
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      const c = mindmap.add(curId);
      onSelect(c.id);
      setEditingId(c.id);
      setLiveMsg("Yeni dal eklendi, başlığı yazın");
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (!cur.parentId) {
        setLiveMsg("Kök düğüm silinemez");
        return;
      }
      const parentId = cur.parentId;
      // Same PWA-safe pattern as handleDeleteSelected: delete now, undo in toast.
      mindmap.remove(curId);
      onSelect(parentId);
      setLiveMsg("Düğüm silindi");
      toast.success(`'${cur.title}' silindi`, {
        action: { label: "Geri al", onClick: () => mindmap.undo() },
      });
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (selectedId) {
        onSelect("");
        setLiveMsg("Seçim temizlendi");
      }
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      setHelpOpen((v) => !v);
      return;
    }
  };

  const handleExport = async () => {
    const data = await mindmap.getPortableSnapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mindgrove-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Dışa aktarıldı");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const summary = importBackupSnapshot(parsed);
        toast.success(`İçe aktarıldı (${summary})`);
      } catch (err) {
        toast.error("Geçersiz dosya: " + (err as Error).message);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden touch-none no-tap-highlight bg-gradient-canvas outline-none focus-visible:ring-2 focus-visible:ring-primary"
      role="tree"
      aria-label="Mindmap"
      aria-activedescendant={selectedId ? `mindnode-${selectedId}` : undefined}
      tabIndex={0}
      onKeyDown={handleKey}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="mindmap-live"
        className="sr-only"
      >
        {liveMsg}
      </div>
      <PerfOverlay />

      {/* Keyboard shortcuts help */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setHelpOpen((v) => !v);
        }}
        aria-label="Klavye kısayolları"
        aria-expanded={helpOpen}
        data-export-hide="true"
        className="pointer-events-auto absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-card text-xs font-bold shadow-soft hover:bg-muted"
      >
        ?
      </button>
      {helpOpen && (
        <div
          role="dialog"
          aria-label="Klavye kısayolları"
          data-testid="mindmap-help"
          data-export-hide="true"
          className="pointer-events-auto absolute right-3 top-12 z-20 w-64 rounded-2xl bg-card p-3 text-xs shadow-leaf"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 font-semibold">Klavye kısayolları</div>
          <ul className="space-y-1">
            <li><kbd className="rounded bg-muted px-1">←↑→↓</kbd> Yöne git</li>
            <li><kbd className="rounded bg-muted px-1">Tab</kbd> / <kbd className="rounded bg-muted px-1">Shift+Tab</kbd> Çocuk / üst</li>
            <li><kbd className="rounded bg-muted px-1">Home</kbd> Köke dön</li>
            <li><kbd className="rounded bg-muted px-1">Enter</kbd> Düğümü aç</li>
            <li><kbd className="rounded bg-muted px-1">Space</kbd> Görev sekmesi</li>
            <li><kbd className="rounded bg-muted px-1">F2</kbd> Yeniden adlandır</li>
            <li><kbd className="rounded bg-muted px-1">n</kbd> Alt dal ekle</li>
            <li><kbd className="rounded bg-muted px-1">c</kbd> / <kbd className="rounded bg-muted px-1">←/→</kbd> Daralt / Genişlet</li>
            <li><kbd className="rounded bg-muted px-1">Del</kbd> Sil</li>
            <li><kbd className="rounded bg-muted px-1">Esc</kbd> Seçimi temizle</li>
          </ul>
        </div>
      )}
      <div
        className="pointer-events-none absolute"
        style={{
          left: originX,
          top: originY,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <svg
          className="absolute"
          style={{
            left: -WORLD / 2,
            top: -WORLD / 2,
            width: WORLD,
            height: WORLD,
          }}
        >
          <g transform={`translate(${WORLD / 2}, ${WORLD / 2})`}>
            {nodes.map((n) => {
              if (!n.parentId) return null;
              if (hiddenIds.has(n.id)) return null;
              // Cull edges where neither endpoint is in viewport
              if (!isVisible(n.id) && !isVisible(n.parentId)) return null;
              const parent = byId.get(n.parentId);
              if (!parent) return null;
              const mx = (parent.x + n.x) / 2;
              const my = (parent.y + n.y) / 2 + 20;
              const inSearch = matchedIds ? matchedIds.has(n.id) && matchedIds.has(parent.id) : true;
              const inFocus = focusIds ? focusIds.has(n.id) && focusIds.has(parent.id) : true;
              const dimEdge = !inSearch || !inFocus;
              return (
                <path
                  key={n.id}
                  d={`M ${parent.x} ${parent.y} Q ${mx} ${my} ${n.x} ${n.y}`}
                  fill="none"
                  stroke="var(--color-leaf)"
                  strokeOpacity={dimEdge ? 0.08 : 0.55}
                  strokeWidth={dimEdge ? 1.5 : 2.5}
                  strokeLinecap="round"
                  style={{ transition: "stroke-opacity 220ms, stroke-width 220ms" }}
                />
              );
            })}

            {/* Free (non-parent) links */}
            {(() => {
              const drawn = new Set<string>();
              const out: ReactNode[] = [];
              nodes.forEach((n) => {
                (n.links ?? []).forEach((lid) => {
                  const key = [n.id, lid].sort().join("|");
                  if (drawn.has(key)) return;
                  drawn.add(key);
                  const other = byId.get(lid);
                  if (!other) return;
                  const inFocus = focusIds
                    ? focusIds.has(n.id) && focusIds.has(other.id)
                    : true;
                  out.push(
                    <line
                      key={key}
                      x1={n.x}
                      y1={n.y}
                      x2={other.x}
                      y2={other.y}
                      stroke="var(--color-accent)"
                      strokeOpacity={inFocus ? 0.7 : 0.15}
                      strokeWidth={1.8}
                      strokeDasharray="6 5"
                      strokeLinecap="round"
                    />,
                  );
                });
              });
              return out;
            })()}
          </g>
        </svg>

        {nodes.map((n) => {
          if (hiddenIds.has(n.id)) return null;
          if (!isVisible(n.id)) return null;
          const searchDim = matchedIds ? !matchedIds.has(n.id) : false;
          const focusDim = focusIds ? !focusIds.has(n.id) : false;
          const dimmed = searchDim || focusDim;
          const kids = childrenByParent.get(n.id)?.length ?? 0;
          return (
            <NodeButton
              key={n.id}
              node={n}
              depth={depthOf(n.id)}
              hasChildren={kids > 0}
              collapsed={collapsedIds.has(n.id)}
              onToggleCollapse={handleToggleCollapse}
              editing={editingId === n.id}
              onCommitEdit={handleCommitEdit}
              onCancelEdit={handleCancelEdit}
              isSelected={
                selectedId === n.id ||
                (linkMode && linkSource === n.id) ||
                (reparentMode && reparentSource === n.id)
              }
              dimmed={dimmed}
              highlighted={matchedIds ? matchedIds.has(n.id) : false}
              justSaved={savedNodeId === n.id}
              onTap={handleTap}
              onStartDrag={handleStartDrag}
            />
          );
        })}
      </div>

      {/* Search overlay (top-center) */}
      <div className="pointer-events-auto absolute left-1/2 top-3 z-20 -translate-x-1/2" data-export-hide="true">
        {searchOpen ? (
            <motion.div
              key="open"
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="flex w-[80vw] max-w-md flex-col gap-1.5"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 rounded-full bg-card px-3 py-2 shadow-leaf">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Düğüm ara..."
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <button
                  onClick={() => {
                    setSearchQ("");
                    setSearchOpen(false);
                  }}
                  aria-label="Kapat"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              {matchedIds && matchedIds.size > 0 && searchQ && (
                <div className="max-h-48 overflow-y-auto rounded-2xl bg-card/95 p-1 shadow-soft backdrop-blur">
                  {nodes
                    .filter((n) => matchedIds.has(n.id))
                    .slice(0, 8)
                    .map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          focusOnNode(n);
                          onSelect(n.id);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: n.color }}
                        />
                        <span className="truncate">{n.title}</span>
                      </button>
                    ))}
                </div>
              )}
              {matchedIds && matchedIds.size === 0 && searchQ && (
                <div className="rounded-2xl bg-card/95 px-3 py-2 text-center text-xs text-muted-foreground shadow-soft backdrop-blur">
                  Eşleşme bulunamadı
                </div>
              )}
            </motion.div>
          ) : (
            <motion.button
              key="closed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setSearchOpen(true)}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-soft"
              aria-label="Mindmap'te ara"
            >
              <Search className="h-4 w-4" />
            </motion.button>
          )}
      </div>

      {/* Focus mode toggle */}
      {selectedId && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setFocusMode((v) => !v)}
          data-export-hide="true"
          className={`absolute right-3 top-28 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-soft transition ${
            focusMode
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground"
          }`}
          aria-pressed={focusMode}
          title="Seçili dalı odakla"
        >
          <span className="h-2 w-2 rounded-full bg-current opacity-80" />
          Odak {focusMode ? "açık" : "kapalı"}
        </button>
      )}

      {/* Link mode toggle */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setLinkMode((v) => !v)}
        data-export-hide="true"
        className={`absolute right-3 top-[10.5rem] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-soft transition ${
          linkMode
            ? "bg-accent text-accent-foreground"
            : "bg-card text-muted-foreground"
        }`}
        aria-pressed={linkMode}
        title="Düğümler arası bağlantı modu"
      >
        🔗 {linkMode ? (linkSource ? "Hedef seç" : "Bağlantı modu") : "Bağla"}
      </button>

      {/* Reparent mode toggle */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setReparentMode((v) => !v)}
        data-export-hide="true"
        className={`absolute right-3 top-[13.25rem] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-soft transition ${
          reparentMode
            ? "bg-amber-500 text-white"
            : "bg-card text-muted-foreground"
        }`}
        aria-pressed={reparentMode}
        title="Düğümü başka üst altına taşı"
      >
        <Move className="h-3 w-3" />
        {reparentMode ? (reparentSource ? "Yeni üst seç" : "Taşıma modu") : "Taşı"}
      </button>

      {/* Undo / Redo */}
      <div
        className="absolute right-3 top-[16rem] flex gap-1.5"
        data-export-hide="true"
      >
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (mindmap.canUndo()) {
              mindmap.undo();
              toast("↶ Geri alındı", { duration: 900 });
            }
          }}
          disabled={!mindmap.canUndo()}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground shadow-soft transition disabled:opacity-40"
          title="Geri al (⌘Z)"
          aria-label="Geri al"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (mindmap.canRedo()) {
              mindmap.redo();
              toast("↷ Yinelendi", { duration: 900 });
            }
          }}
          disabled={!mindmap.canRedo()}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground shadow-soft transition disabled:opacity-40"
          title="Yinele (⌘⇧Z)"
          aria-label="Yinele"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>





      <Minimap
        nodes={nodes}
        viewport={{ w: size.w, h: size.h }}
        pan={pan}
        scale={scale}
        onRecenter={(x, y) => setPan({ x: -x * scale, y: -y * scale })}
      />

      <MindmapToolbar
        open={toolsOpen}
        onToggle={() => setToolsOpen((v) => !v)}
        lastSavedAt={lastSavedAt}
        fileInputRef={fileInputRef}
        selectedNode={selectedNode ?? undefined}
        templatesOpen={templatesOpen}
        onToggleTemplates={() => setTemplatesOpen((v) => !v)}
        onApplyTemplate={handleApplyTemplate}
        onSaveNodeAsTemplate={handleSaveNodeAsTemplate}
        onSave={() => {
          mindmap.commitMove();
          setLastSavedAt(Date.now());
          toast.success("Kaydedildi");
        }}
        onExport={handleExport}
        onImportClick={() => fileInputRef.current?.click()}
        onImportFile={handleImport}
        onZoomIn={() => zoomAt(1.2, size.w / 2, size.h / 2)}
        onZoomOut={() => zoomAt(1 / 1.2, size.w / 2, size.h / 2)}
        onDriveSave={handleDriveSave}
        onDriveLoad={handleDriveLoad}
        onResetView={resetView}
        onPngExport={handlePngExport}
      />

      {/* Action FABs bottom-right — `layer-fab-context` keeps them below
          AI/Pomodoro so the wrench toolbar's `layer-toolbar` still wins
          on the left, and AI/Pomodoro's `layer-fab` still wins on the
          right when both occupy the same side. */}
      <div
        className={`layer-fab-context fixed flex flex-col items-center gap-3 ${contextSlot.side === "right" ? "right-3" : "left-3"}`}
        style={{ bottom: `calc(${contextSlot.bottom}px + env(safe-area-inset-bottom))` }}
        data-export-hide="true"
        data-fab-id="mindmap-context"


      >

        {selectedNode && selectedNode.parentId && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteSelected();
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-soft"
            aria-label="Seçili düğümü sil"
          >
            <Trash2 className="h-5 w-5" />
          </motion.button>
        )}
        {selectedNode && onOpenTodoSheet && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenTodoSheet(selectedNode.id);
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft"
            aria-label="Görev ekle"
            title="Görev ekle"
          >
            <ClipboardList className="h-5 w-5" />
          </motion.button>
        )}
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            handleAddChildSelected();
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-leaf"
          aria-label={selectedNode ? "Seçili düğüme alt dal ekle" : "Köke alt dal ekle"}
        >
          <Plus className="h-6 w-6" />
        </motion.button>
      </div>
    </div>
  );
}



const NodeButton = memo(function NodeButton({
  node,
  depth = 1,
  editing = false,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
  isSelected,
  dimmed,
  highlighted,
  justSaved,
  onTap,
  onStartDrag,
  onCommitEdit,
  onCancelEdit,
}: {
  node: MindNode;
  depth?: number;
  editing?: boolean;
  hasChildren?: boolean;
  collapsed?: boolean;
  // These take the node id rather than closing over it, so the parent can pass
  // stable references and memo() actually holds.
  onToggleCollapse?: (id: string) => void;
  isSelected: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  /** Just created/updated — brief post-save flash (§13). */
  justSaved?: boolean;
  onTap: (id: string) => void;
  onStartDrag: (e: React.PointerEvent, pos: { x: number; y: number }, id: string) => void;
  onCommitEdit?: (id: string, title: string) => void;
  onCancelEdit?: () => void;
}) {
  perfCounters.nodeRenders += 1;
  const isRoot = node.parentId === null;
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const [draft, setDraft] = useState(node.title);

  useEffect(() => {
    if (editing) setDraft(node.title);
  }, [editing, node.title]);

  return (
    <div
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: node.x, top: node.y }}
    >
      <motion.button
        id={`mindnode-${node.id}`}
        role="treeitem"
        aria-selected={isSelected}
        aria-level={depth}
        aria-expanded={hasChildren ? !collapsed : undefined}
        aria-label={`${node.title}${node.todos.length ? `, ${node.todos.length} görev` : ""}`}
        data-node-id={node.id}
        data-testid={`mindnode-${node.id}`}
        data-collapsed={collapsed ? "true" : "false"}
        tabIndex={-1}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onStartDrag(e, { x: node.x, y: node.y }, node.id);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          downPos.current = { x: e.clientX, y: e.clientY };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          if (!downPos.current) return;
          const dx = e.clientX - downPos.current.x;
          const dy = e.clientY - downPos.current.y;
          if (Math.hypot(dx, dy) > 6) moved.current = true;
        }}
        onPointerUp={() => {
          downPos.current = null;
        }}
        onPointerCancel={() => {
          downPos.current = null;
          moved.current = true;
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (moved.current) return;
          onTap(node.id);
        }}
        className={`relative block select-none rounded-2xl px-4 py-3 text-center transition-all ${
          isSelected
            ? "ring-4 ring-accent ring-offset-2 ring-offset-background shadow-leaf scale-105"
            : "shadow-soft"
        } ${highlighted ? "ring-2 ring-amber-400 ring-offset-1" : ""} ${
          justSaved ? "ring-4 ring-primary ring-offset-2 ring-offset-background animate-pulse" : ""
        } ${
          isRoot ? "text-lg font-bold" : "text-sm font-semibold"
        }`}
        style={{
          background: isRoot ? "var(--gradient-node)" : node.color,
          color: isRoot ? "var(--color-primary-foreground)" : "var(--color-bark)",
          minWidth: isRoot ? 140 : 110,
          maxWidth: 200,
          opacity: dimmed ? 0.12 : 1,
          filter: dimmed ? "saturate(0.25) blur(0.6px)" : undefined,
          transition: "opacity 220ms, filter 220ms, transform 180ms",
        }}
      >
        {editing ? (
          <input
            autoFocus
            value={draft}
            aria-label="Düğüm başlığını düzenle"
            data-testid={`mindnode-edit-${node.id}`}
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => onCommitEdit?.(node.id, draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommitEdit?.(node.id, draft);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit?.();
              }
              e.stopPropagation();
            }}
            className="w-full rounded-md border border-input bg-background px-2 py-0.5 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <div className="break-words">{node.title}</div>
        )}
        {node.todos.length > 0 && (
          <div className="mt-1 text-[10px] font-medium opacity-70">
            {node.todos.filter((t) => t.done).length}/{node.todos.length} görev
          </div>
        )}
        {(node.tags?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap justify-center gap-1">
            {node.tags!.slice(0, 3).map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] font-semibold"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
        {node.reminderAt && node.reminderAt > Date.now() && (
          <div className="mt-0.5 text-[10px] opacity-70">⏰ hatırlatıcı</div>
        )}
      </motion.button>
      {hasChildren && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.(node.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleCollapse?.(node.id);
            }
          }}
          aria-label={collapsed ? `${node.title} dalını genişlet` : `${node.title} dalını daralt`}
          aria-expanded={!collapsed}
          aria-controls={`mindnode-${node.id}`}
          data-testid={`mindnode-toggle-${node.id}`}
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-bold leading-none shadow-soft focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {collapsed ? "+" : "−"}
        </button>
      )}
    </div>
  );
});
