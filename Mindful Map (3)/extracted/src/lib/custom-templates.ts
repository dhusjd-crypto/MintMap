import type { MindTemplate, TemplateNode } from "./templates";
import type { MindNode } from "./mindmap-store";

const KEY = "mintmap.templates.custom";

export type CustomTemplate = MindTemplate & { custom: true; createdAt: number };

const listeners = new Set<() => void>();

function read(): CustomTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CustomTemplate =>
        !!t && typeof t === "object" && typeof (t as CustomTemplate).id === "string",
    );
  } catch {
    return [];
  }
}

function write(list: CustomTemplate[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
  listeners.forEach((l) => l());
}

export const customTemplates = {
  list(): CustomTemplate[] {
    return read();
  },
  save(tpl: Omit<CustomTemplate, "custom" | "createdAt" | "id"> & { id?: string }): CustomTemplate {
    const list = read();
    const item: CustomTemplate = {
      ...tpl,
      id: tpl.id ?? `custom-${Date.now().toString(36)}`,
      custom: true,
      createdAt: Date.now(),
    };
    write([...list.filter((t) => t.id !== item.id), item]);
    return item;
  },
  remove(id: string) {
    write(read().filter((t) => t.id !== id));
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Convert a node and its descendants (up to depth 3) into TemplateNodes. */
export function subtreeAsTemplateNodes(nodes: MindNode[], rootId: string, depth = 3): TemplateNode[] {
  const byParent = new Map<string | null, MindNode[]>();
  nodes.forEach((n) => {
    const key = n.parentId;
    const arr = byParent.get(key) ?? [];
    arr.push(n);
    byParent.set(key, arr);
  });
  const build = (id: string, d: number): TemplateNode[] => {
    const kids = byParent.get(id) ?? [];
    return kids.map((k) => ({
      title: k.title,
      color: k.color,
      todos: k.todos.map((t) => t.text).filter(Boolean),
      ...(d > 0 ? { children: build(k.id, d - 1) } : {}),
    }));
  };
  return build(rootId, depth);
}
