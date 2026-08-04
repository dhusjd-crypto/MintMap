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
});
