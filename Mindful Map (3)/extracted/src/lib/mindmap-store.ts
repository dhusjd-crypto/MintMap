import { useCallback, useEffect, useSyncExternalStore } from "react";
import { nanoid } from "nanoid";

export type TodoStep = { id: string; text: string; done: boolean };
export type Recurrence = "daily" | "weekly" | "monthly";
export type TodoStatus = "todo" | "doing" | "done";
export type Priority = 1 | 2 | 3 | 4; // 1 = highest
export type Todo = {
  id: string;
  text: string;
  done: boolean;
  status?: TodoStatus;
  parentId?: string | null;
  note?: string;
  dueAt?: number;
  reminderAt?: number;
  starred?: boolean;
  myDay?: boolean;
  myDayAt?: number;
  steps?: TodoStep[];
  tags?: string[];
  createdAt?: number;
  completedAt?: number;
  recurrence?: Recurrence;
  estimateMin?: number;
  focusedMin?: number;
  priority?: Priority;
  blockedBy?: string[]; // todo ids that must be done first
  googleEventId?: string;
  syncedAt?: number;
};
export type ImageAspect = "auto" | "1:1" | "16:9" | "4:3" | "3:4";
export type ImageFit = "cover" | "contain";
export type MindImage = {
  id: string;
  src: string;
  srcOriginal?: string;
  aspect?: ImageAspect;
  fit?: ImageFit;
  focus?: { x: number; y: number }; // 0..1 — object-position for cover
  caption?: string;
};
export type MindNode = {
  id: string;
  parentId: string | null;
  title: string;
  note: string;
  color: string;
  x: number;
  y: number;
  todos: Todo[];
  image?: string; // legacy + canvas display: mirrors active image src
  images?: MindImage[];
  activeImageId?: string;
  reminderAt?: number;
  tags?: string[];
  createdAt: number;
  links?: string[];
  imageAspect?: ImageAspect;
  imageFit?: ImageFit;
};

export type Workspace = {
  id: string;
  name: string;
  emoji?: string;
  nodes: MindNode[];
};

export type StoreShape = { workspaces: Workspace[]; currentId: string };

const STORAGE_KEY_V2 = "mindgrove.v2";
const STORAGE_KEY_V1 = "mindgrove.v1";
const HISTORY_LIMIT = 40;

const PALETTE = [
  "oklch(0.88 0.06 210)",
  "oklch(0.86 0.05 230)",
  "oklch(0.9 0.05 190)",
  "oklch(0.88 0.07 60)",
  "oklch(0.86 0.08 30)",
  "oklch(0.84 0.06 280)",
];

function seedNodes(): MindNode[] {
  const rootId = nanoid(8);
  const now = Date.now();
  return [
    {
      id: rootId,
      parentId: null,
      title: "Fikirlerim",
      note: "Ana düğümüne dokun, alt dallar ekle.",
      color: PALETTE[0],
      x: 0,
      y: 0,
      todos: [],
      createdAt: now,
    },
    {
      id: nanoid(8),
      parentId: rootId,
      title: "Hafta planı",
      note: "Bu hafta yapılacaklar",
      color: PALETTE[1],
      x: -140,
      y: 140,
      todos: [
        { id: nanoid(6), text: "Spor", done: false, status: "todo" },
        { id: nanoid(6), text: "Kitap oku", done: true, status: "done" },
      ],
      createdAt: now,
    },
    {
      id: nanoid(8),
      parentId: rootId,
      title: "Proje fikri",
      note: "",
      color: PALETTE[3],
      x: 140,
      y: 160,
      todos: [],
      createdAt: now,
    },
  ];
}

function seedStore(): StoreShape {
  const ws: Workspace = { id: nanoid(8), name: "Kişisel", emoji: "🌿", nodes: seedNodes() };
  return { workspaces: [ws], currentId: ws.id };
}

let store: StoreShape = { workspaces: [], currentId: "" };
let initialized = false;
const listeners = new Set<() => void>();
let cachedAllTodos: Array<{ wsId: string; wsName: string; nodeId: string; nodeTitle: string; todo: Todo }> | null = null;


type HistoryEntry = StoreShape;
const history: { past: HistoryEntry[]; future: HistoryEntry[] } = { past: [], future: [] };

function cloneStore(s: StoreShape): StoreShape {
  return {
    currentId: s.currentId,
    workspaces: s.workspaces.map((w) => ({
      ...w,
      nodes: w.nodes.map((n) => ({
        ...n,
        todos: n.todos.map((t) => ({ ...t, steps: t.steps ? t.steps.map((x) => ({ ...x })) : t.steps })),
        tags: n.tags ? [...n.tags] : n.tags,
        links: n.links ? [...n.links] : n.links,
      })),
    })),
  };
}

function load() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") {
    store = seedStore();
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as StoreShape;
      if (parsed?.workspaces?.length) {
        store = parsed;
        return;
      }
    }
    const legacy = localStorage.getItem(STORAGE_KEY_V1);
    if (legacy) {
      const nodes = JSON.parse(legacy) as MindNode[];
      const ws: Workspace = { id: nanoid(8), name: "Kişisel", emoji: "🌿", nodes };
      store = { workspaces: [ws], currentId: ws.id };
      persist();
      return;
    }
    store = seedStore();
  } catch {
    store = seedStore();
  }
}

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(store));
}

function emit() {
  persist();
  cachedAllTodos = null;
  listeners.forEach((l) => l());
}


function notifyOnly() {
  cachedAllTodos = null;
  listeners.forEach((l) => l());
}


function pushHistory() {
  history.past.push(cloneStore(store));
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
}

/** Wraps a mutation: snapshots, runs, persists+notifies. */
function mutate(fn: () => void) {
  pushHistory();
  fn();
  emit();
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}

function currentWs(): Workspace | undefined {
  return store.workspaces.find((w) => w.id === store.currentId);
}

function setCurrentNodes(updater: (nodes: MindNode[]) => MindNode[]) {
  store = {
    ...store,
    workspaces: store.workspaces.map((w) =>
      w.id === store.currentId ? { ...w, nodes: updater(w.nodes) } : w,
    ),
  };
}

// ----- React selectors -----

const EMPTY_NODES: MindNode[] = [];
const EMPTY_STORE: StoreShape = { workspaces: [], currentId: "" };
function snapshotNodes(): MindNode[] {
  load();
  return currentWs()?.nodes ?? EMPTY_NODES;
}
function serverSnapshotNodes(): MindNode[] {
  return EMPTY_NODES;
}
export function useNodes(): MindNode[] {
  return useSyncExternalStore(subscribe, snapshotNodes, serverSnapshotNodes);
}


export function useNode(id: string | null): MindNode | undefined {
  const nodes = useNodes();
  return id ? nodes.find((n) => n.id === id) : undefined;
}

export function useWorkspaces(): { workspaces: Workspace[]; currentId: string } {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return store;
    },
    () => EMPTY_STORE,
  );
}

// (canUndo / canRedo are read imperatively via mindmap.canUndo()/canRedo() inside components
// that already re-render on store changes; no hook needed.)

// ----- Status normalization for todos -----

function normStatus(t: Todo, patch: Partial<Todo>): Partial<Todo> {
  const next = { ...t, ...patch };
  // Sync done <-> status when one of them is patched.
  if (patch.status !== undefined && patch.done === undefined) {
    next.done = patch.status === "done";
  } else if (patch.done !== undefined && patch.status === undefined) {
    next.status = patch.done ? "done" : "todo";
  }
  return { done: next.done, status: next.status };
}

// ----- Public API -----

export const mindmap = {
  // Workspace ops
  workspace: {
    list(): Workspace[] {
      return store.workspaces;
    },
    current(): Workspace | undefined {
      return currentWs();
    },
    switch(id: string) {
      if (!store.workspaces.some((w) => w.id === id)) return;
      store = { ...store, currentId: id };
      emit();
    },
    create(name: string, emoji = "🌿"): Workspace {
      const ws: Workspace = { id: nanoid(8), name, emoji, nodes: seedNodes() };
      mutate(() => {
        store = { workspaces: [...store.workspaces, ws], currentId: ws.id };
      });
      return ws;
    },
    rename(id: string, name: string, emoji?: string) {
      mutate(() => {
        store = {
          ...store,
          workspaces: store.workspaces.map((w) =>
            w.id === id ? { ...w, name, ...(emoji ? { emoji } : {}) } : w,
          ),
        };
      });
    },
    remove(id: string) {
      if (store.workspaces.length <= 1) return;
      mutate(() => {
        const list = store.workspaces.filter((w) => w.id !== id);
        store = { workspaces: list, currentId: store.currentId === id ? list[0].id : store.currentId };
      });
    },
    duplicate(id: string) {
      const src = store.workspaces.find((w) => w.id === id);
      if (!src) return;
      const copy: Workspace = {
        id: nanoid(8),
        name: `${src.name} (kopya)`,
        emoji: src.emoji,
        nodes: cloneStore({ ...store, workspaces: [src], currentId: src.id }).workspaces[0].nodes,
      };
      mutate(() => {
        store = { workspaces: [...store.workspaces, copy], currentId: copy.id };
      });
    },
  },

  // History
  undo() {
    const prev = history.past.pop();
    if (!prev) return;
    history.future.push(cloneStore(store));
    store = prev;
    persist();
    notifyOnly();
  },
  redo() {
    const next = history.future.pop();
    if (!next) return;
    history.past.push(cloneStore(store));
    store = next;
    persist();
    notifyOnly();
  },
  canUndo() {
    return history.past.length > 0;
  },
  canRedo() {
    return history.future.length > 0;
  },

  // Node ops
  add(parentId: string | null, title = "Yeni fikir"): MindNode {
    const ws = currentWs()!;
    const parent = ws.nodes.find((n) => n.id === parentId);
    const angle = Math.random() * Math.PI * 2;
    const r = 150;
    const node: MindNode = {
      id: nanoid(8),
      parentId,
      title,
      note: "",
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      x: (parent?.x ?? 0) + Math.cos(angle) * r,
      y: (parent?.y ?? 0) + Math.sin(angle) * r,
      todos: [],
      createdAt: Date.now(),
    };
    mutate(() => setCurrentNodes((ns) => [...ns, node]));
    return node;
  },
  update(id: string, patch: Partial<MindNode>) {
    mutate(() => setCurrentNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n))));
  },
  move(id: string, x: number, y: number) {
    // High-frequency drag — no history, no persist, just notify.
    setCurrentNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)));
    notifyOnly();
  },
  commitMove() {
    persist();
  },
  /** Reparent a node. Refuses cycles (target inside descendants of id). */
  setParent(id: string, newParentId: string): boolean {
    const ws = currentWs();
    if (!ws) return false;
    if (id === newParentId) return false;
    const node = ws.nodes.find((n) => n.id === id);
    const target = ws.nodes.find((n) => n.id === newParentId);
    if (!node || !target) return false;
    if (node.parentId === null) return false; // root cannot be reparented
    if (node.parentId === newParentId) return false;
    // Cycle check: ensure target isn't a descendant of id
    const descendants = new Set<string>();
    const visit = (i: string) => {
      descendants.add(i);
      ws.nodes.filter((c) => c.parentId === i).forEach((c) => visit(c.id));
    };
    visit(id);
    if (descendants.has(newParentId)) return false;
    // Relocate near new parent to keep layout readable.
    const dx = node.x - (ws.nodes.find((n) => n.id === node.parentId)?.x ?? 0);
    const dy = node.y - (ws.nodes.find((n) => n.id === node.parentId)?.y ?? 0);
    const nx = target.x + dx * 0.6;
    const ny = target.y + dy * 0.6;
    mutate(() =>
      setCurrentNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, parentId: newParentId, x: nx, y: ny } : n)),
      ),
    );
    return true;
  },
  remove(id: string) {
    const ws = currentWs();
    if (!ws) return;
    const toRemove = new Set<string>();
    const visit = (i: string) => {
      toRemove.add(i);
      ws.nodes.filter((n) => n.parentId === i).forEach((c) => visit(c.id));
    };
    visit(id);
    mutate(() =>
      setCurrentNodes((ns) =>
        ns
          .filter((n) => !toRemove.has(n.id))
          .map((n) => ({
            ...n,
            links: n.links ? n.links.filter((l) => !toRemove.has(l)) : n.links,
          })),
      ),
    );
  },
  addTodo(id: string, text: string, parentId: string | null = null, extra: Partial<Todo> = {}) {
    const ws = currentWs();
    const n = ws?.nodes.find((x) => x.id === id);
    if (!n) return;
    this.update(id, {
      todos: [
        ...n.todos,
        {
          id: nanoid(6),
          text,
          done: false,
          status: "todo",
          parentId,
          createdAt: Date.now(),
          steps: [],
          ...extra,
        },
      ],
    });
  },
  updateTodo(id: string, todoId: string, patch: Partial<Todo>) {
    const ws = currentWs();
    const n = ws?.nodes.find((x) => x.id === id);
    if (!n) return;
    this.update(id, {
      todos: n.todos.map((t) => {
        if (t.id !== todoId) return t;
        const synced = normStatus(t, patch);
        return { ...t, ...patch, ...synced };
      }),
    });
  },
  setTodoStatus(id: string, todoId: string, status: TodoStatus) {
    this.updateTodo(id, todoId, { status, done: status === "done", completedAt: status === "done" ? Date.now() : undefined });
  },
  addStep(id: string, todoId: string, text: string) {
    const ws = currentWs();
    const n = ws?.nodes.find((x) => x.id === id);
    const t = n?.todos.find((x) => x.id === todoId);
    if (!n || !t) return;
    this.updateTodo(id, todoId, {
      steps: [...(t.steps ?? []), { id: nanoid(5), text, done: false }],
    });
  },
  toggleStep(id: string, todoId: string, stepId: string) {
    const ws = currentWs();
    const n = ws?.nodes.find((x) => x.id === id);
    const t = n?.todos.find((x) => x.id === todoId);
    if (!n || !t) return;
    this.updateTodo(id, todoId, {
      steps: (t.steps ?? []).map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)),
    });
  },
  removeStep(id: string, todoId: string, stepId: string) {
    const ws = currentWs();
    const n = ws?.nodes.find((x) => x.id === id);
    const t = n?.todos.find((x) => x.id === todoId);
    if (!n || !t) return;
    this.updateTodo(id, todoId, { steps: (t.steps ?? []).filter((s) => s.id !== stepId) });
  },
  reorderSteps(id: string, todoId: string, steps: TodoStep[]) {
    this.updateTodo(id, todoId, { steps });
  },
  toggleTodo(id: string, todoId: string) {
    const ws = currentWs();
    const n = ws?.nodes.find((x) => x.id === id);
    if (!n) return;
    this.update(id, {
      todos: n.todos.map((t) => {
        if (t.id !== todoId) return t;
        if (!t.done && t.recurrence) {
          const base = t.dueAt && t.dueAt > Date.now() - 86_400_000 ? t.dueAt : Date.now();
          const d = new Date(base);
          if (t.recurrence === "daily") d.setDate(d.getDate() + 1);
          else if (t.recurrence === "weekly") d.setDate(d.getDate() + 7);
          else if (t.recurrence === "monthly") d.setMonth(d.getMonth() + 1);
          return { ...t, dueAt: d.getTime(), done: false, status: "todo", completedAt: Date.now() };
        }
        const nextDone = !t.done;
        return {
          ...t,
          done: nextDone,
          status: nextDone ? "done" : "todo",
          completedAt: nextDone ? Date.now() : undefined,
        };
      }),
    });
  },
  toggleLink(aId: string, bId: string) {
    if (aId === bId) return;
    const ws = currentWs();
    const a = ws?.nodes.find((n) => n.id === aId);
    const b = ws?.nodes.find((n) => n.id === bId);
    if (!ws || !a || !b) return;
    const aLinks = new Set(a.links ?? []);
    const bLinks = new Set(b.links ?? []);
    if (aLinks.has(bId)) {
      aLinks.delete(bId);
      bLinks.delete(aId);
    } else {
      aLinks.add(bId);
      bLinks.add(aId);
    }
    mutate(() =>
      setCurrentNodes((ns) =>
        ns.map((n) =>
          n.id === aId
            ? { ...n, links: Array.from(aLinks) }
            : n.id === bId
              ? { ...n, links: Array.from(bLinks) }
              : n,
        ),
      ),
    );
  },
  applyTemplate(
    parentId: string,
    nodes: Array<{ title: string; color?: string; todos?: string[]; children?: unknown }>,
  ) {
    const ws = currentWs();
    const parent = ws?.nodes.find((n) => n.id === parentId);
    if (!ws || !parent) return;
    const created: MindNode[] = [];
    const count = nodes.length;
    const baseAngle = -Math.PI / 2;
    nodes.forEach((tpl, i) => {
      const angle = baseAngle + (i * (Math.PI * 2)) / Math.max(count, 1);
      const r = 180;
      const node: MindNode = {
        id: nanoid(8),
        parentId,
        title: tpl.title,
        note: "",
        color: tpl.color ?? PALETTE[i % PALETTE.length],
        x: parent.x + Math.cos(angle) * r,
        y: parent.y + Math.sin(angle) * r,
        todos: (tpl.todos ?? []).map((text) => ({
          id: nanoid(6),
          text,
          done: false,
          status: "todo",
          steps: [],
          createdAt: Date.now(),
        })),
        createdAt: Date.now(),
      };
      created.push(node);
    });
    mutate(() => setCurrentNodes((ns) => [...ns, ...created]));
  },
  removeTodo(id: string, todoId: string) {
    const ws = currentWs();
    const n = ws?.nodes.find((x) => x.id === id);
    if (!n) return;
    const toRemove = new Set<string>();
    const visit = (tid: string) => {
      toRemove.add(tid);
      n.todos.filter((t) => t.parentId === tid).forEach((c) => visit(c.id));
    };
    visit(todoId);
    this.update(id, { todos: n.todos.filter((t) => !toRemove.has(t.id)) });
  },
  reset() {
    mutate(() => setCurrentNodes(() => seedNodes()));
  },
  getSnapshot(): MindNode[] {
    load();
    return currentWs()?.nodes ?? [];
  },
  importSnapshot(nodes: MindNode[]) {
    mutate(() => setCurrentNodes(() => nodes));
  },
  /** Full backup including all workspaces. */
  getFullSnapshot(): StoreShape {
    load();
    return store;
  },
  importFullSnapshot(s: StoreShape) {
    if (!s?.workspaces?.length) return;
    mutate(() => {
      const currentId = s.workspaces.some((w) => w.id === s.currentId)
        ? s.currentId
        : s.workspaces[0].id;
      store = { ...s, currentId };
    });
  },
  /** Update a todo in any workspace (used by background scheduler). */
  updateTodoIn(wsId: string, nodeId: string, todoId: string, patch: Partial<Todo>) {
    pushHistory();
    store = {
      ...store,
      workspaces: store.workspaces.map((w) =>
        w.id !== wsId
          ? w
          : {
              ...w,
              nodes: w.nodes.map((n) =>
                n.id !== nodeId
                  ? n
                  : {
                      ...n,
                      todos: n.todos.map((t) => {
                        if (t.id !== todoId) return t;
                        const synced = normStatus(t, patch);
                        return { ...t, ...patch, ...synced };
                      }),
                    },
              ),
            },
      ),
    };
    emit();
  },
  /** Subscribe to any store change. Returns unsubscribe. */
  subscribeAll(listener: () => void): () => void {
    load();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Flat list of every todo across every workspace. */
  allTodos(): Array<{ wsId: string; wsName: string; nodeId: string; nodeTitle: string; todo: Todo }> {
    load();
    if (cachedAllTodos) return cachedAllTodos;
    const out: Array<{ wsId: string; wsName: string; nodeId: string; nodeTitle: string; todo: Todo }> = [];
    store.workspaces.forEach((w) =>
      w.nodes.forEach((n) =>
        n.todos.forEach((t) =>
          out.push({ wsId: w.id, wsName: w.name, nodeId: n.id, nodeTitle: n.title, todo: t }),
        ),
      ),
    );
    cachedAllTodos = out;
    return out;
  },

};

export function useReminderScheduler() {
  const nodes = useNodes();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    nodes.forEach((n) => {
      if (!n.reminderAt) return;
      const delay = n.reminderAt - Date.now();
      if (delay <= 0 || delay > 1000 * 60 * 60 * 24) return;
      timers.push(
        setTimeout(() => {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("🌿 Hatırlatma", { body: n.title });
          }
        }, delay),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [nodes]);
}

export function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") Notification.requestPermission();
}

export const useMindmapActions = () => useCallback(() => mindmap, [])();
