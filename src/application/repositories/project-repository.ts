import { mindmap, type MindNode } from "@/lib/mindmap-store";

export type ProjectRecord = MindNode;

export interface ProjectRepository {
  get(id: string): ProjectRecord | undefined;
  list(): ProjectRecord[];
}

/** A read-only compatibility boundary; project identity is currently a node ID. */
export class LegacyProjectRepository implements ProjectRepository {
  list(): ProjectRecord[] {
    return mindmap.workspace.current()?.nodes ?? [];
  }

  get(id: string): ProjectRecord | undefined {
    return this.list().find((node) => node.id === id);
  }
}
