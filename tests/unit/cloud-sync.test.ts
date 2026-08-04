import { describe, expect, it } from "vitest";
import { mergeCloudSnapshots } from "@/lib/cloud-sync";

function snapshot(workspaceId: string, nodeId: string, title: string) {
  return {
    version: 1 as const,
    mindmap: {
      currentId: workspaceId,
      workspaces: [{
        id: workspaceId,
        name: "Mint",
        nodes: [{
          id: nodeId,
          parentId: null,
          title,
          note: "",
          color: "#ffffff",
          x: 0,
          y: 0,
          todos: [],
          createdAt: 1,
        }],
      }],
    },
    keep: [],
    deletedKeepIds: undefined,
  };
}

function taskSnapshot(todoId: string, text: string) {
  return {
    id: todoId,
    text,
    done: false,
    status: "todo" as const,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("cloud workspace reconciliation", () => {
  it("folds same-named legacy workspaces into the cloud workspace", () => {
    const cloud = snapshot("desktop-mint", "prym", "Prym");
    const phone = snapshot("phone-mint", "phone-root", "Telefon notu");

    const merged = mergeCloudSnapshots(phone, cloud);

    expect(merged.mindmap.workspaces).toHaveLength(1);
    expect(merged.mindmap.workspaces[0].id).toBe("desktop-mint");
    expect(merged.mindmap.workspaces[0].nodes.map((node) => node.title)).toEqual(
      expect.arrayContaining(["Prym", "Telefon notu"]),
    );
  });

  it("keeps a deleted node deleted when an older device still has it", () => {
    const cloud = snapshot("mint", "old-node", "Yeni fikir");
    const phone = snapshot("mint", "phone-node", "Telefon notu");
    phone.mindmap.workspaces[0].deletedNodeIds = { "old-node": Date.now() };

    const merged = mergeCloudSnapshots(phone, cloud);

    expect(merged.mindmap.workspaces[0].nodes.map((node) => node.id)).not.toContain("old-node");
    expect(merged.mindmap.workspaces[0].deletedNodeIds?.["old-node"]).toBeDefined();
  });

  it("keeps a deleted todo deleted when an older device still has it", () => {
    const cloud = snapshot("mint", "node", "Hafta planı");
    cloud.mindmap.workspaces[0].nodes[0].todos = [taskSnapshot("turkiye-finans", "Türkiye Finans")];
    const phone = snapshot("mint", "node", "Hafta planı");
    phone.mindmap.workspaces[0].nodes[0].todos = [];
    phone.mindmap.workspaces[0].deletedTodoIds = { "turkiye-finans": Date.now() };

    const merged = mergeCloudSnapshots(phone, cloud);

    expect(merged.mindmap.workspaces[0].nodes[0].todos).toEqual([]);
    expect(merged.mindmap.workspaces[0].deletedTodoIds?.["turkiye-finans"]).toBeDefined();
  });

  it("keeps a deleted Keep card deleted when an older device still has it", () => {
    const cloud = snapshot("mint", "node", "Hafta planı");
    cloud.keep = [{ id: "old-card", type: "note", text: "Eski kart", createdAt: 1, updatedAt: 1 }];
    const phone = snapshot("mint", "node", "Hafta planı");
    phone.keep = [];
    phone.deletedKeepIds = { "old-card": Date.now() };

    const merged = mergeCloudSnapshots(phone, cloud);

    expect(merged.keep).toEqual([]);
    expect(merged.deletedKeepIds?.["old-card"]).toBeDefined();
  });

  it("keeps deleted attachments out of a merged task", () => {
    const cloud = snapshot("mint", "node", "Hafta planı");
    cloud.mindmap.workspaces[0].nodes[0].todos = [{
      ...taskSnapshot("task", "Görev"),
      attachments: [{ id: "old-file", name: "not.pdf", type: "application/pdf", size: 1, blobId: "blob", addedAt: 1 }],
    }];
    const phone = snapshot("mint", "node", "Hafta planı");
    phone.mindmap.workspaces[0].nodes[0].todos = [{ ...taskSnapshot("task", "Görev"), attachments: [] }];
    phone.mindmap.workspaces[0].deletedEntryIds = { "old-file": Date.now() };

    const merged = mergeCloudSnapshots(phone, cloud);

    expect(merged.mindmap.workspaces[0].nodes[0].todos[0].attachments).toEqual([]);
  });
});
