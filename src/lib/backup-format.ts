import type { MindNode, StoreShape } from "@/lib/mindmap-store";

export type BackupPayload =
  | {
      kind: "legacy";
      nodes: MindNode[];
      summary: string;
      isDefaultSeed: boolean;
    }
  | {
      kind: "full";
      store: StoreShape;
      summary: string;
      isDefaultSeed: boolean;
    };

const DEFAULT_NODE_TITLES = new Set(["Fikirlerim", "Hafta planı", "Proje fikri"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isMindNodeLike(value: unknown): value is MindNode {
  if (!isObject(value)) return false;
  return typeof value.id === "string" && typeof value.title === "string";
}

function isLegacyNodes(value: unknown): value is MindNode[] {
  return Array.isArray(value) && value.every(isMindNodeLike);
}

function isStoreShape(value: unknown): value is StoreShape {
  if (!isObject(value) || !Array.isArray(value.workspaces)) return false;
  return value.workspaces.every(
    (workspace) =>
      isObject(workspace) &&
      typeof workspace.id === "string" &&
      typeof workspace.name === "string" &&
      Array.isArray(workspace.nodes) &&
      workspace.nodes.every(isMindNodeLike),
  );
}

function unwrapBackup(value: unknown): unknown {
  if (!isObject(value)) return value;
  if (isStoreShape(value.snapshot)) return value.snapshot;
  if (isStoreShape(value.store)) return value.store;
  if (isStoreShape(value.data)) return value.data;
  return value;
}

export function isDefaultSeedNodes(nodes: MindNode[]): boolean {
  if (nodes.length !== 3) return false;
  return nodes.every((node) => DEFAULT_NODE_TITLES.has(node.title));
}

export function isDefaultSeedStore(store: StoreShape): boolean {
  if (store.workspaces.length !== 1) return false;
  const [workspace] = store.workspaces;
  return workspace.name === "Kişisel" && isDefaultSeedNodes(workspace.nodes);
}

export function describeStoreSnapshot(store: StoreShape): string {
  const workspaceCount = store.workspaces.length;
  const nodeCount = store.workspaces.reduce((total, workspace) => total + workspace.nodes.length, 0);
  return `${workspaceCount} çalışma alanı, ${nodeCount} düğüm`;
}

export function shouldAllowCloudSave(store: StoreShape): boolean {
  return store.workspaces.length > 0 && !isDefaultSeedStore(store);
}

export function readBackupPayload(parsed: unknown): BackupPayload {
  const unwrapped = unwrapBackup(parsed);

  if (isLegacyNodes(unwrapped)) {
    return {
      kind: "legacy",
      nodes: unwrapped,
      summary: `eski format, ${unwrapped.length} düğüm`,
      isDefaultSeed: isDefaultSeedNodes(unwrapped),
    };
  }

  if (isStoreShape(unwrapped) && unwrapped.workspaces.length) {
    return {
      kind: "full",
      store: unwrapped,
      summary: describeStoreSnapshot(unwrapped),
      isDefaultSeed: isDefaultSeedStore(unwrapped),
    };
  }

  throw new Error("Geçersiz yedek formatı");
}
