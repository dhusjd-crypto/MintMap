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
});
