import { describe, expect, it } from "vitest";
import {
  CanonicalExecutionTaskRepository,
  PersistenceWriteError,
} from "@/application/repositories/canonical-execution-repository";
import type { TaskRepository, TaskRecord } from "@/application/repositories/task-repository";
import { InMemoryCanonicalStorage } from "@/lib/canonical-persistence/storage";
import type { Todo } from "@/lib/mindmap-store";

function makeRepository(throwsOnUpdate = false) {
  let current: Todo = {
    id: "task-1",
    text: "Görevi koru",
    done: false,
    status: "todo",
    createdAt: 1,
    updatedAt: 1,
  };
  const record = (): TaskRecord => ({
    task: current,
    workspaceId: "ws",
    workspaceName: "Kişisel",
    nodeId: "node",
    nodeTitle: "Proje",
  });
  const repository: TaskRepository = {
    get: (id) => (id === current.id ? record() : undefined),
    list: () => [record()],
    create: () => record(),
    update: (_id, patch) => {
      if (throwsOnUpdate) throw new Error("legacy write failed");
      current = { ...current, ...patch };
      return record();
    },
    complete: () => record(),
    reopen: () => record(),
    remove: () => false,
  };
  return { repository, read: () => current };
}

describe("composed Execution persistence", () => {
  it("hydrates legacy task plus canonical extension and preserves the canonical ID", async () => {
    const legacy = makeRepository();
    const storage = new InMemoryCanonicalStorage();
    const repository = new CanonicalExecutionTaskRepository(legacy.repository, storage);
    await repository.saveExtension("task-1", {
      context: "telefon",
      followUpAt: 1700000000000,
      strategicWeight: 80,
    });
    const hydrated = await repository.get("task-1");
    expect(hydrated?.canonical.id).toBe("task-1");
    expect(hydrated?.canonical.context).toBe("telefon");
    expect(hydrated?.canonical.followUpAt).toBe(1700000000000);
  });

  it("writes the extension before legacy compatibility and exposes partial failure", async () => {
    const legacy = makeRepository(true);
    const storage = new InMemoryCanonicalStorage();
    const repository = new CanonicalExecutionTaskRepository(legacy.repository, storage);
    await expect(
      repository.save({
        id: "task-1",
        title: "Görevi koru",
        state: "READY",
        createdAt: 1,
        updatedAt: 2,
        lastTouchedAt: 2,
        snoozeCount: 0,
        notificationCount: 0,
        blockedBy: [],
        blocks: [],
        notificationPolicy: "NORMAL",
        metadata: {},
        context: "iş",
      }),
    ).rejects.toBeInstanceOf(PersistenceWriteError);
    expect((await storage.get("execution_extensions", "task-1"))?.payload).toMatchObject({
      context: "iş",
    });
    expect((await storage.list("persistence_operations"))[0].payload).toMatchObject({
      status: "FAILED",
      retryable: true,
    });
    expect(legacy.read().text).toBe("Görevi koru");
  });
});
