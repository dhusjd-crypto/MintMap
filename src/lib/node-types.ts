// Node türleri. MintMap düğümleri artık bir role sahip olabilir (Alan, Hedef,
// Proje…). Tür OPSİYONEL: eski/typesiz düğümler "generic" (Genel) sayılır ve
// hiçbir davranış değişmez.

import {
  Circle,
  Layers,
  Target,
  FolderKanban,
  CheckSquare,
  StickyNote,
  Link2,
  Building2,
  Landmark,
  type LucideIcon,
} from "lucide-react";

export type NodeType =
  "generic" | "area" | "goal" | "project" | "task" | "note" | "resource" | "company" | "asset";

/** Etiket + ikon + ince renk ipucu (mevcut pastel oklch paletiyle uyumlu). */
export const NODE_TYPES: Record<NodeType, { label: string; icon: LucideIcon; tint: string }> = {
  generic: { label: "Genel", icon: Circle, tint: "oklch(0.7 0.03 250)" },
  area: { label: "Alan", icon: Layers, tint: "oklch(0.7 0.1 200)" },
  goal: { label: "Hedef", icon: Target, tint: "oklch(0.72 0.15 25)" },
  project: { label: "Proje", icon: FolderKanban, tint: "oklch(0.72 0.12 145)" },
  task: { label: "Görev", icon: CheckSquare, tint: "oklch(0.72 0.12 90)" },
  note: { label: "Not", icon: StickyNote, tint: "oklch(0.75 0.1 95)" },
  resource: { label: "Kaynak", icon: Link2, tint: "oklch(0.7 0.1 280)" },
  company: { label: "Şirket", icon: Building2, tint: "oklch(0.7 0.08 260)" },
  asset: { label: "Varlık", icon: Landmark, tint: "oklch(0.7 0.1 160)" },
};

/** Seçici/menü sırası. */
export const NODE_TYPE_ORDER: NodeType[] = [
  "generic",
  "area",
  "goal",
  "project",
  "task",
  "note",
  "resource",
  "company",
  "asset",
];

/** Bir düğümün türü — atanmamışsa "generic". */
export function nodeTypeOf(n: { type?: NodeType }): NodeType {
  return n.type ?? "generic";
}
