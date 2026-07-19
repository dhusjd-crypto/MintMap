import { motion } from "framer-motion";
import { useOverlayPresence } from "@/lib/use-overlay-presence";
import {
  Cloud,
  CloudCheck,
  CloudDownload,
  Download,
  Image as ImageIcon,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import type { Ref } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TemplateMenu } from "@/components/mindmap/TemplateMenu";
import { useFabSlot } from "@/lib/fab-slots";
import type { MindNode } from "@/lib/mindmap-store";

/** Approximate height of one collapsed wrench toggle button. */
const TOOLBAR_COLLAPSED_HEIGHT = 40;
/** Height of the fully expanded action column (toggle + ~11 tool buttons + gaps). */
const TOOLBAR_EXPANDED_HEIGHT = 460;


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
};

function ToolBtn({
  onClick,
  label,
  title,
  children,
}: {
  onClick: () => void;
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-soft"
      aria-label={label}
      title={title ?? label}
    >
      {children}
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
}: Props) {
  const menuMounted = useOverlayPresence(open, 220);
  // Wrench toolbar reserves the LEFT side at priority 1.
  // When open it reports its expanded height so AI/Pomodoro overlap-
  // detection automatically pushes them to the right side.
  useFabSlot({
    id: "wrench-toolbar",
    preferredSide: "left",
    height: open ? TOOLBAR_EXPANDED_HEIGHT : TOOLBAR_COLLAPSED_HEIGHT,
    width: 40,
    priority: 1,
    expanded: open,
  });

  return (
    <div
      className="layer-toolbar absolute bottom-4 left-3 flex flex-col items-center gap-1.5"
      data-export-hide="true"
      data-fab-id="wrench-toolbar"
      data-fab-open={open ? "true" : "false"}
    >

      {lastSavedAt && (
          <motion.div
            key={lastSavedAt}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-1 flex items-center gap-1 rounded-full bg-card px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-soft"
          >
            <CloudCheck className="h-3 w-3" />
            Otomatik kaydedildi
          </motion.div>
        )}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggle}
        data-testid="toolbar-toggle"
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-soft transition ${
          open ? "bg-primary text-primary-foreground rotate-45" : "bg-card"
        }`}
        aria-label={open ? "Araçları kapat" : "Araçları aç"}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="mindmap-toolbar-actions"
        title="Araçlar"
      >
        {open ? <X className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
      </button>
      {menuMounted && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: open ? 1 : 0, y: open ? 0 : 8, scale: open ? 1 : 0.9 }}
            transition={{ duration: 0.18 }}
            id="mindmap-toolbar-actions"
            role="menu"
            aria-label="Mindmap araçları"
            data-testid="toolbar-actions"
            style={{ pointerEvents: open ? "auto" : "none" }}
            className="flex flex-col items-center gap-1.5"
          >
            <ToolBtn onClick={onSave} label="Kaydet">
              <Save className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn onClick={onExport} label="Dışa aktar">
              <Download className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn onClick={onImportClick} label="İçe aktar">
              <Upload className="h-4 w-4" />
            </ToolBtn>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={onImportFile}
              className="hidden"
            />
            <ToolBtn onClick={onZoomIn} label="Yakınlaştır">
              <Plus className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn onClick={onZoomOut} label="Uzaklaştır">
              <Minus className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn onClick={onDriveSave} label="Drive'a kaydet">
              <Cloud className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn onClick={onDriveLoad} label="Drive'dan yükle">
              <CloudDownload className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn onClick={onResetView} label="Sıfırla">
              <RotateCcw className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn onClick={onPngExport} label="PNG olarak indir" title="PNG indir">
              <ImageIcon className="h-4 w-4" />
            </ToolBtn>
            <TemplateMenu
              open={templatesOpen}
              onToggle={onToggleTemplates}
              selectedNode={selectedNode}
              onApply={onApplyTemplate}
              onSaveFromNode={onSaveNodeAsTemplate}
            />
            <ThemeToggle />
          </motion.div>
        )}
    </div>
  );
}
