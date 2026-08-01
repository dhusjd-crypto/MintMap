import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-blobs", () => ({
  putImage: vi.fn(async () => true),
  getImage: vi.fn(async () => null),
  getImageUrl: vi.fn(async () => null),
  getImageDataUrl: vi.fn(async () => null),
  deleteImage: vi.fn(async () => undefined),
  listImageIds: vi.fn(async () => []),
  dataUrlToBlob: vi.fn(() => null),
}));

describe("legacy step migration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("converts ordered steps into child todos and is idempotent", async () => {
    const legacy = {
      currentId: "ws-1",
      workspaces: [{
        id: "ws-1",
        name: "Kişisel",
        nodes: [{
          id: "node-1",
          parentId: null,
          title: "Hafta planı",
          note: "",
          color: "teal",
          x: 0,
          y: 0,
          createdAt: 1,
          todos: [{
            id: "todo-1",
            text: "Mimar ile görüş",
            done: false,
            steps: [
              { id: "step-1", text: "Konuları hazırla", done: true },
              { id: "step-2", text: "Yeni tarih belirle", done: false },
            ],
          }],
        }],
      }],
    };
    localStorage.setItem("mindgrove.v2", JSON.stringify(legacy));

    const mod = await import("@/lib/mindmap-store");
    const first = mod.mindmap.getSnapshot().find((node) => node.id === "node-1")!;
    const children = first.todos.filter((todo) => todo.parentId === "todo-1");

    expect(children.map((todo) => todo.text)).toEqual(["Konuları hazırla", "Yeni tarih belirle"]);
    expect(children.map((todo) => todo.done)).toEqual([true, false]);
    expect(first.todos.some((todo) => "steps" in todo)).toBe(false);

    const persisted = JSON.parse(localStorage.getItem("mindgrove.v2")!);
    const persistedTodos = persisted.workspaces[0].nodes[0].todos;
    expect(persistedTodos.filter((todo: { parentId?: string }) => todo.parentId === "todo-1")).toHaveLength(2);
    expect(JSON.stringify(persisted)).not.toContain("step-1");
  });
});
