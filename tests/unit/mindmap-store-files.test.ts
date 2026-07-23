import { beforeEach, describe, expect, it, vi } from "vitest";

type Store = typeof import("@/lib/mindmap-store");

// Fresh module per test — the store is singleton module state.
let mod: Store;

const STORAGE_KEY = "mindgrove.v2";

// jsdom has no IndexedDB; stub the blob store with an in-memory map so
// addFile & friends behave as if IDB accepted the bytes.
const fakeBlobs = new Map<string, unknown>();
vi.mock("@/lib/image-blobs", () => ({
  putImage: async (id: string, data: unknown) => {
    fakeBlobs.set(id, data);
    return true;
  },
  getImage: async (id: string) => fakeBlobs.get(id) ?? null,
  getImageUrl: async (id: string) => (fakeBlobs.has(id) ? `blob:fake-${id}` : null),
  getImageDataUrl: async (id: string) =>
    fakeBlobs.has(id) ? `data:application/pdf;base64,FAKE${id}` : null,
  deleteImage: async (id: string) => void fakeBlobs.delete(id),
  listImageIds: async () => [...fakeBlobs.keys()],
  dataUrlToBlob: () => null,
}));

const pdf = (name = "rapor.pdf") =>
  new File(["%PDF-1.4 fake"], name, { type: "application/pdf" });

describe("mindmap store — file attachments", () => {
  beforeEach(async () => {
    localStorage.clear();
    fakeBlobs.clear();
    vi.resetModules();
    mod = await import("@/lib/mindmap-store");
    mod.mindmap.getSnapshot();
  });

  it("addFile stores bytes in the blob store and metadata on the node", async () => {
    const n = mod.mindmap.add(null, "Belgeli");
    const entry = await mod.mindmap.addFile(n.id, pdf());

    expect(entry).not.toBeNull();
    expect(fakeBlobs.has(entry!.blobId)).toBe(true);
    const files = mod.mindmap.getSnapshot().find((x) => x.id === n.id)!.files!;
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: "rapor.pdf", type: "application/pdf" });
  });

  it("persisted store carries metadata but never the bytes", async () => {
    const n = mod.mindmap.add(null, "Belgeli");
    await mod.mindmap.addFile(n.id, pdf());

    const raw = localStorage.getItem(STORAGE_KEY)!;
    expect(raw).toContain("rapor.pdf");
    expect(raw).not.toContain("%PDF");
    expect(raw).not.toContain("dataUrl");
  });

  it("removeFile detaches and undo brings it back", async () => {
    const n = mod.mindmap.add(null, "Belgeli");
    const entry = await mod.mindmap.addFile(n.id, pdf());

    mod.mindmap.removeFile(n.id, entry!.id);
    expect(mod.mindmap.getSnapshot().find((x) => x.id === n.id)!.files).toHaveLength(0);

    mod.mindmap.undo();
    const files = mod.mindmap.getSnapshot().find((x) => x.id === n.id)!.files!;
    expect(files.map((f) => f.id)).toEqual([entry!.id]);
    // The blob must still exist for the undone row to be openable.
    expect(fakeBlobs.has(entry!.blobId)).toBe(true);
  });

  it("sweep keeps attachment blobs alive and only drops true orphans", async () => {
    const n = mod.mindmap.add(null, "Belgeli");
    const entry = await mod.mindmap.addFile(n.id, pdf());
    fakeBlobs.set("orphan-blob", "x");

    await mod.sweepUnusedImageBlobs();

    expect(fakeBlobs.has(entry!.blobId)).toBe(true);
    expect(fakeBlobs.has("orphan-blob")).toBe(false);
  });

  it("manual portable snapshot inlines the bytes; auto-sync variant does not", async () => {
    const n = mod.mindmap.add(null, "Belgeli");
    const entry = await mod.mindmap.addFile(n.id, pdf());

    const manual = await mod.mindmap.getPortableSnapshot();
    const auto = await mod.mindmap.getPortableSnapshot({ includeFiles: false });
    const fileOf = (s: typeof manual) =>
      s.workspaces.flatMap((w) => w.nodes).find((x) => x.id === n.id)!.files![0];

    expect(fileOf(manual).dataUrl).toContain(entry!.blobId);
    expect(fileOf(auto).dataUrl).toBeUndefined();
  });

  it("importing a backup with bytes lands them in the blob store and strips dataUrl", async () => {
    const n = mod.mindmap.add(null, "Belgeli");
    const entry = await mod.mindmap.addFile(n.id, pdf());
    const backup = await mod.mindmap.getPortableSnapshot();

    // Simulate a different device: no blobs yet.
    fakeBlobs.clear();
    mod.mindmap.importFullSnapshot(backup);
    await new Promise((r) => setTimeout(r, 0)); // let migrateInlineImages run

    expect(fakeBlobs.has(entry!.blobId)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)!).not.toContain("dataUrl");
  });

  it("stores task-level attachments without mixing them into node files", async () => {
    const n = mod.mindmap.add(null, "Ä°nÅŸaat");
    mod.mindmap.addTodo(n.id, "Mimar GÃ¶khan ile gÃ¶rÃ¼ÅŸ");
    const todoId = mod.mindmap.getSnapshot().find((x) => x.id === n.id)!.todos[0].id;
    const entry = await mod.mindmap.addTodoAttachment(n.id, todoId, pdf("plan.pdf"));

    const node = mod.mindmap.getSnapshot().find((x) => x.id === n.id)!;
    expect(node.files ?? []).toHaveLength(0);
    expect(node.todos[0].attachments).toHaveLength(1);
    expect(node.todos[0].attachments![0].name).toBe("plan.pdf");
    expect(fakeBlobs.has(entry!.blobId)).toBe(true);
  });

  it("keeps task attachments in portable backups and activity is undoable", async () => {
    const n = mod.mindmap.add(null, "Ä°nÅŸaat");
    mod.mindmap.addTodo(n.id, "Mimar GÃ¶khan ile gÃ¶rÃ¼ÅŸ");
    const todoId = mod.mindmap.getSnapshot().find((x) => x.id === n.id)!.todos[0].id;
    const entry = await mod.mindmap.addTodoAttachment(n.id, todoId, pdf("notlar.pdf"));
    mod.mindmap.addTodoActivity(n.id, todoId, "GÃ¶rÃ¼ÅŸme yapÄ±ldÄ±, revize plan beklenecek.");

    const manual = await mod.mindmap.getPortableSnapshot();
    const todo = manual.workspaces.flatMap((w) => w.nodes).find((x) => x.id === n.id)!.todos[0];
    expect(todo.attachments![0].dataUrl).toContain(entry!.blobId);
    expect(todo.activity).toHaveLength(1);

    mod.mindmap.removeTodoActivity(n.id, todoId, todo.activity![0].id);
    mod.mindmap.undo();
    expect(mod.mindmap.getSnapshot().find((x) => x.id === n.id)!.todos[0].activity).toHaveLength(1);
  });

  it("reorders only siblings and preserves the subtask tree", () => {
    const n = mod.mindmap.add(null, "Sıralama");
    mod.mindmap.addTodo(n.id, "Birinci");
    mod.mindmap.addTodo(n.id, "İkinci");
    const initial = mod.mindmap.getSnapshot().find((x) => x.id === n.id)!;
    const [first, second] = initial.todos;
    mod.mindmap.addTodo(n.id, "Birinci alt görev", first.id);

    mod.mindmap.reorderTodos(n.id, null, [second.id, first.id]);

    const todos = mod.mindmap.getSnapshot().find((x) => x.id === n.id)!.todos;
    expect(todos.filter((todo) => !todo.parentId).map((todo) => todo.text)).toEqual(["İkinci", "Birinci"]);
    expect(todos.find((todo) => todo.parentId === first.id)?.text).toBe("Birinci alt görev");
  });
});
