import { beforeEach, describe, expect, it } from "vitest";

import { mindmap, type MindNode, type StoreShape } from "@/lib/mindmap-store";

const STORAGE_KEY = "mindgrove.v2";

// A stand-in for real image bytes — large enough that persisting it would be
// the thing that eats the localStorage quota.
const DATA_URL = "data:image/jpeg;base64," + "A".repeat(2048);

const node = (over: Partial<MindNode> = {}): MindNode => ({
  id: "n1",
  parentId: null,
  title: "Düğüm",
  note: "",
  color: "#fff",
  x: 0,
  y: 0,
  todos: [],
  createdAt: 1,
  ...over,
});

const storeWith = (n: MindNode): StoreShape => ({
  currentId: "w1",
  workspaces: [{ id: "w1", name: "Kişisel", nodes: [n] }],
});

const persisted = (): StoreShape => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const firstImage = () => persisted().workspaces[0].nodes[0].images![0];

describe("mindmap store — image persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    // Force the store to initialise now, while storage is empty. Otherwise the
    // first read would lazily load the stripped copy we just wrote and clobber
    // the in-memory one — there is no IndexedDB here to rehydrate it from.
    mindmap.getFullSnapshot();
  });

  it("keeps the blob id but drops the bytes from localStorage", () => {
    mindmap.importFullSnapshot(
      storeWith(
        node({
          images: [{ id: "i1", src: DATA_URL, blobId: "blob-1" }],
          activeImageId: "i1",
        }),
      ),
    );

    const img = firstImage();
    expect(img.blobId).toBe("blob-1");
    expect(img.src).toBe("");
    expect(localStorage.getItem(STORAGE_KEY)!).not.toContain("base64");
  });

  it("does not mirror the image onto node.image either", () => {
    // node.image duplicates the active src for the canvas — persisting it would
    // put the payload back into localStorage through the side door.
    mindmap.importFullSnapshot(
      storeWith(
        node({
          image: DATA_URL,
          images: [{ id: "i1", src: DATA_URL, blobId: "blob-1" }],
          activeImageId: "i1",
        }),
      ),
    );

    expect(persisted().workspaces[0].nodes[0].image).toBeUndefined();
  });

  it("drops the pre-crop original's bytes when it too has a blob", () => {
    mindmap.importFullSnapshot(
      storeWith(
        node({
          images: [
            {
              id: "i1",
              src: DATA_URL,
              blobId: "blob-1",
              srcOriginal: DATA_URL,
              blobIdOriginal: "blob-0",
            },
          ],
          activeImageId: "i1",
        }),
      ),
    );

    const img = firstImage();
    expect(img.blobIdOriginal).toBe("blob-0");
    expect(img.srcOriginal).toBe("");
  });

  it("keeps inline images that have no blob — never lose an image", () => {
    // IndexedDB is unavailable in this environment, so the migration cannot
    // move it out. Dropping the src here would destroy the only copy.
    mindmap.importFullSnapshot(
      storeWith(
        node({ images: [{ id: "i1", src: DATA_URL }], activeImageId: "i1" }),
      ),
    );

    expect(firstImage().src).toBe(DATA_URL);
  });

  it("leaves image-free nodes untouched", () => {
    mindmap.importFullSnapshot(storeWith(node({ title: "Sade" })));

    const n = persisted().workspaces[0].nodes[0];
    expect(n.title).toBe("Sade");
    expect(n.images).toBeUndefined();
  });

  it("preserves the rest of the node while stripping the bytes", () => {
    mindmap.importFullSnapshot(
      storeWith(
        node({
          title: "Görselli",
          tags: ["iş"],
          todos: [{ id: "t1", text: "yap", done: false }],
          images: [{ id: "i1", src: DATA_URL, blobId: "blob-1", aspect: "16:9", fit: "contain" }],
          activeImageId: "i1",
        }),
      ),
    );

    const n = persisted().workspaces[0].nodes[0];
    expect(n.title).toBe("Görselli");
    expect(n.tags).toEqual(["iş"]);
    expect(n.todos[0].text).toBe("yap");
    expect(n.activeImageId).toBe("i1");
    expect(n.images![0].aspect).toBe("16:9");
    expect(n.images![0].fit).toBe("contain");
  });

  it("keeps the in-memory snapshot usable — only the written copy is stripped", () => {
    mindmap.importFullSnapshot(
      storeWith(
        node({
          images: [{ id: "i1", src: DATA_URL, blobId: "blob-1" }],
          activeImageId: "i1",
        }),
      ),
    );

    // The canvas renders from this, so it must still hold a usable URL.
    expect(mindmap.getFullSnapshot().workspaces[0].nodes[0].images![0].src).toBe(DATA_URL);
  });
});
