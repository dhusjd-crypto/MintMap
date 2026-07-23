import { describe, expect, it } from "vitest";

import { comparePriority, hasOpenDescendants, isBlocked, wouldCreateDependencyCycle } from "@/lib/task-utils";
import type { Todo } from "@/lib/mindmap-store";

const todo = (over: Partial<Todo> & { id: string }): Todo => ({
  text: "",
  done: false,
  ...over,
});

describe("isBlocked", () => {
  it("is false when nothing is declared as a blocker", () => {
    expect(isBlocked(todo({ id: "a" }), [])).toBe(false);
  });

  it("is true while a declared dependency is unfinished", () => {
    const dep = todo({ id: "dep", done: false });
    expect(isBlocked(todo({ id: "a", blockedBy: ["dep"] }), [dep])).toBe(true);
  });

  it("clears once the dependency is done", () => {
    const dep = todo({ id: "dep", done: true });
    expect(isBlocked(todo({ id: "a", blockedBy: ["dep"] }), [dep])).toBe(false);
  });

  it("ignores blockers that no longer exist in the node", () => {
    // A deleted dependency must not deadlock the task forever.
    expect(isBlocked(todo({ id: "a", blockedBy: ["ghost"] }), [])).toBe(false);
  });

  it("stays blocked while any one of several dependencies is open", () => {
    const siblings = [todo({ id: "x", done: true }), todo({ id: "y", done: false })];
    expect(isBlocked(todo({ id: "a", blockedBy: ["x", "y"] }), siblings)).toBe(true);
  });
});

describe("comparePriority", () => {
  it("puts the more urgent priority first", () => {
    expect(comparePriority(todo({ id: "a", priority: 1 }), todo({ id: "b", priority: 4 }))).toBeLessThan(0);
  });

  it("ranks any prioritised task above an unprioritised one", () => {
    expect(comparePriority(todo({ id: "a", priority: 4 }), todo({ id: "b" }))).toBeLessThan(0);
  });

  it("falls back to the earlier due date at equal priority", () => {
    const a = todo({ id: "a", priority: 2, dueAt: 100 });
    const b = todo({ id: "b", priority: 2, dueAt: 200 });
    expect(comparePriority(a, b)).toBeLessThan(0);
  });

  it("puts tasks with a due date ahead of ones without", () => {
    const a = todo({ id: "a", priority: 2, dueAt: 100 });
    const b = todo({ id: "b", priority: 2 });
    expect(comparePriority(a, b)).toBeLessThan(0);
  });

  it("falls back to creation order when priority and due date match", () => {
    const a = todo({ id: "a", priority: 2, dueAt: 100, createdAt: 5 });
    const b = todo({ id: "b", priority: 2, dueAt: 100, createdAt: 9 });
    expect(comparePriority(a, b)).toBeLessThan(0);
  });

  it("sorts a realistic list end to end", () => {
    const list = [
      todo({ id: "none" }),
      todo({ id: "low", priority: 4 }),
      todo({ id: "urgent-late", priority: 1, dueAt: 900 }),
      todo({ id: "urgent-soon", priority: 1, dueAt: 100 }),
    ];
    expect([...list].sort(comparePriority).map((t) => t.id)).toEqual([
      "urgent-soon",
      "urgent-late",
      "low",
      "none",
    ]);
  });
});

describe("task graph safety", () => {
  it("finds unfinished descendants at any depth", () => {
    const parent = todo({ id: "parent" });
    const child = todo({ id: "child", parentId: "parent", done: true });
    const grandchild = todo({ id: "grandchild", parentId: "child", done: false });
    expect(hasOpenDescendants(parent, [parent, child, grandchild])).toBe(true);
  });

  it("rejects a dependency that would close a loop", () => {
    const a = todo({ id: "a", blockedBy: ["b"] });
    const b = todo({ id: "b", blockedBy: ["c"] });
    const c = todo({ id: "c" });
    expect(wouldCreateDependencyCycle("c", "a", [a, b, c])).toBe(true);
    expect(wouldCreateDependencyCycle("a", "c", [a, b, c])).toBe(false);
  });
});
