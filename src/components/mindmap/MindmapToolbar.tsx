import { motion } from "framer-motion";
import { useOverlayPresence } from "@/lib/use-overlay-presence";
import {
  Cloud,
  CloudCheck,
  CloudDownload,
  CircleHelp,
  Download,
  Image as ImageIcon,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Save,
  Search,
  Undo2,
  Redo2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import type { Ref } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TemplateMenu } from "@/components/mindmap/TemplateMenu";
import type { MindNode } from "@/lib/mindmap-store";

type Props = {
  open: boolean;
  onToggle: () => void;
  lastSavedAt: number | null;
  fileInputRef: Ref<HTMLInputElement>;
  selectedNode: MindNode | undefined;
  templatesOpen: boolean;
  onToggleTemplates: () => void;
  onApplyTemplate: (id: string) => void;
  onSaveNodeAsTemplate?: (name: string, emoji: string) => void;
  onSave: () => void;
  onExport: () => void;
  onImportClick: () => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onDriveSave: () => void;
  onDriveLoad: () => void;
  onResetView: () => void;
  onPngExport: () => void;
  map?: React.ReactNode;
  focusActive: boolean;
  linkActive: boolean;
  moveActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSearch: () => void;
  onToggleFocus: () => void;
  onToggleLink: () => void;
  onToggleMove: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleHelp: () => void;
};

function ToolBtn({
  onClick,
  label,
  title,
  disabled = false,
  children,
}: {
  onClick: () => void;
  label: string;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-xs font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70">{children}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function MindmapToolbar({
  open,
  onToggle,
  lastSavedAt,
  fileInputRef,
  selectedNode,
  templatesOpen,
  onToggleTemplates,
  onApplyTemplate,
  onSaveNodeAsTemplate,
  onSave,
  onExport,
  onImportClick,
  onImportFile,
  onZoomIn,
  onZoomOut,
  onDriveSave,
  onDriveLoad,
  onResetView,
  onPngExport,
  map,
  focusActive,
  linkActive,
  moveActive,
  canUndo,
  canRedo,
  onSearch,
  onToggleFocus,
  onToggleLink,
  onToggleMove,
  onUndo,
  onRedo,
  onToggleHelp,
}: Props) {
  const menuMounted = useOverlayPresence(open, 220);
  return (
    <div
      className="absolute right-3 top-3 z-30"
      data-export-hide="true"
      data-fab-id="wrench-toolbar"
      data-fab-open={open ? "true" : "false"}
    >

      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggle}
        data-testid="toolbar-toggle"
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-soft transition ${
          open ? "bg-primary text-primary-foreground" : "bg-card"
        }`}
        aria-label={open ? "Araçları kapat" : "Araçları aç"}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="mindmap-toolbar-actions"
        title="Araçlar"
      >
        {open ? <X className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
      </button>
      {menuMounted && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: open ? 1 : 0, y: open ? 0 : -6, scale: open ? 1 : 0.98 }}
            transition={{ duration: 0.18 }}
            id="mindmap-toolbar-actions"
            role="menu"
            aria-label="Mindmap araçları"
            data-testid="toolbar-actions"
            style={{ pointerEvents: open ? "auto" : "none" }}
            className="absolute right-0 top-12 max-h-[calc(100dvh-7rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border/70 bg-card p-2 shadow-leaf"
          >
            {map && (
              <section className="mb-2 border-b border-border/60 px-2 pb-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Harita</p>
                {map}
              </section>
            )}
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gezinme ve düzenleme</p>
            <div className="grid grid-cols-2 gap-1">
              <ToolBtn onClick={onSearch} label="Ara"><Search className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onToggleHelp} label="Kısayollar"><CircleHelp className="h-4 w-4" /></ToolBtn>
              {selectedNode && <ToolBtn onClick={onToggleFocus} label={focusActive ? "Odağı kapat" : "Dala odaklan"}><span className="h-3 w-3 rounded-full bg-current" /></ToolBtn>}
              <ToolBtn onClick={onToggleLink} label={linkActive ? "Bağlamayı bitir" : "Düğüm bağla"}>🔗</ToolBtn>
              <ToolBtn onClick={onToggleMove} label={moveActive ? "Taşımayı bitir" : "Düğümü taşı"}><Move className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onUndo} label="Geri al" disabled={!canUndo}><Undo2 className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onRedo} label="Yinele" disabled={!canRedo}><Redo2 className="h-4 w-4" /></ToolBtn>
            </div>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Çalışma alanı</p>
            <div className="grid grid-cols-2 gap-1">
              <ToolBtn onClick={onSave} label="Kaydet"><Save className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onResetView} label="Görünümü sıfırla"><RotateCcw className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onZoomIn} label="Yakınlaştır"><Plus className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onZoomOut} label="Uzaklaştır"><Minus className="h-4 w-4" /></ToolBtn>
            </div>
            <p className="mt-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Yedek ve dışa aktar</p>
            <div className="grid grid-cols-2 gap-1">
              <ToolBtn onClick={onDriveSave} label="Drive'a yedekle"><Cloud className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onDriveLoad} label="Drive'dan al"><CloudDownload className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onExport} label="JSON dışa aktar"><Download className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onImportClick} label="JSON içe aktar"><Upload className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={onPngExport} label="PNG indir"><ImageIcon className="h-4 w-4" /></ToolBtn>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={onImportFile}
              className="hidden"
            />
            <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
              <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Şablon ve görünüm</span>
            <TemplateMenu
              open={templatesOpen}
              onToggle={onToggleTemplates}
              selectedNode={selectedNode}
              onApply={onApplyTemplate}
              onSaveFromNode={onSaveNodeAsTemplate}
            />
            <ThemeToggle />
            </div>
            {lastSavedAt && <div className="mt-2 flex items-center gap-1 px-2 text-[10px] text-muted-foreground"><CloudCheck className="h-3 w-3" /> Otomatik kaydedildi</div>}
          </motion.div>
        )}
    </div>
  );
}
