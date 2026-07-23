import { beforeEach, describe, expect, it, vi } from "vitest";

type Mindmap = typeof import("@/lib/mindmap-store").mindmap;

// The store is module-level singleton state, and `reset()` is itself an undoable
// mutation — so a shared instance would leak history between tests. Each test
// gets a freshly imported module instead.
let mindmap: Mindmap;

// History no longer deep-clones the store on every edit; it just keeps the
// previous object, which is only safe while every mutation rebuilds the store
// immutably. These tests pin that invariant down — an in-place mutation
// anywhere in the store would silently rewrite history instead of failing loud.

const nodes = () => mindmap.getSnapshot();
const byTitle = (t: string) => nodes().find((n) => n.title === t);

describe("mindmap store — history and immutability", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    ({ mindmap } = await import("@/lib/mindmap-store"));
    // Touch the store so it initialises from empty storage (seed data).
    mindmap.getSnapshot();
  });

  it("undo restores the previous title", () => {
    const n = mindmap.add(null, "İlk");
    mindmap.update(n.id, { title: "Değişti" });
    expect(byTitle("Değişti")).toBeTruthy();

    mindmap.undo();
    expect(byTitle("İlk")).toBeTruthy();
    expect(byTitle("Değişti")).toBeUndefined();
  });

  it("redo re-applies what undo took back", () => {
    const n = mindmap.add(null, "İlk");
    mindmap.update(n.id, { title: "Değişti" });
    mindmap.undo();
    mindmap.redo();
    expect(byTitle("Değişti")).toBeTruthy();
  });

  it("does not hand out the same node object across an edit", () => {
    // If update mutated in place, the pre-edit reference would show the new
    // value and the history entry would be corrupt.
    const n = mindmap.add(null, "Sabit");
    const before = nodes().find((x) => x.id === n.id)!;
    mindmap.update(n.id, { title: "Yeni" });
    const after = nodes().find((x) => x.id === n.id)!;

    expect(before).not.toBe(after);
    expect(before.title).toBe("Sabit");
    expect(after.title).toBe("Yeni");
  });

  it("keeps earlier snapshots intact through several edits", () => {
    const n = mindmap.add(null, "v1");
    mindmap.update(n.id, { title: "v2" });
    mindmap.update(n.id, { title: "v3" });

    mindmap.undo();
    expect(byTitle("v2")).toBeTruthy();
    mindmap.undo();
    expect(byTitle("v1")).toBeTruthy();
  });

  it("undo restores a deleted node", () => {
    const n = mindmap.add(null, "Silinecek");
    mindmap.remove(n.id);
    expect(byTitle("Silinecek")).toBeUndefined();

    mindmap.undo();
    expect(byTitle("Silinecek")).toBeTruthy();
  });

  it("undo rolls back todo edits without touching siblings", () => {
    const n = mindmap.add(null, "Görevli");
    mindmap.addTodo(n.id, "bir");
    mindmap.addTodo(n.id, "iki");
    const todoId = byTitle("Görevli")!.todos[0].id;

    mindmap.updateTodo(n.id, todoId, { text: "bir-değişti" });
    expect(byTitle("Görevli")!.todos.map((t) => t.text)).toEqual(["bir-değişti", "iki"]);

    mindmap.undo();
    expect(byTitle("Görevli")!.todos.map((t) => t.text)).toEqual(["bir", "iki"]);
  });

  it("does not reuse todo objects across an edit", () => {
    const n = mindmap.add(null, "Görevli");
    mindmap.addTodo(n.id, "bir");
    const before = byTitle("Görevli")!.todos[0];
    mindmap.updateTodo(n.id, before.id, { done: true });

    expect(before.done).toBe(false);
    expect(byTitle("Görevli")!.todos[0].done).toBe(true);
  });

  it("uses the manual list order without changing parent relationships", () => {
    const n = mindmap.add(null, "Sıralı");
    const first = mindmap.addTodo(n.id, "bir")!;
    const second = mindmap.addTodo(n.id, "iki")!;
    const child = mindmap.addTodo(n.id, "alt", first.id)!;

    mindmap.reorderTodosFromFlatList(n.id, [second.id, child.id, first.id]);

    const todos = byTitle("Sıralı")!.todos;
    expect(todos.map((todo) => todo.id)).toEqual([second.id, child.id, first.id]);
    expect(todos.find((todo) => todo.id === child.id)?.parentId).toBe(first.id);
  });

  it("a fresh edit clears the redo stack", () => {
    const n = mindmap.add(null, "İlk");
    mindmap.update(n.id, { title: "İkinci" });
    mindmap.undo();
    expect(mindmap.canRedo()).toBe(true);

    mindmap.update(n.id, { title: "Üçüncü" });
    expect(mindmap.canRedo()).toBe(false);
  });

  it("reports canUndo only once there is something to undo", () => {
    expect(mindmap.canUndo()).toBe(false);
    mindmap.add(null, "Bir şey");
    expect(mindmap.canUndo()).toBe(true);
  });

  it("undo is a no-op on an empty history", () => {
    const before = nodes().length;
    mindmap.undo();
    expect(nodes().length).toBe(before);
  });
});
