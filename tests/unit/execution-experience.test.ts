import { describe, expect, it } from "vitest";
import { createExecutionExperienceQueries } from "@/application/queries/execution-experience-queries";
import type { Todo } from "@/lib/mindmap-store";

const todo = (extra: Partial<Todo> = {}): Todo => ({
  id: "task-1",
  text: "Aranacak kişiyle görüş",
  done: false,
  createdAt: Date.parse("2026-08-01T09:00:00Z"),
  estimateMin: 15,
  priority: 1,
  ...extra,
});

describe("execution experience read model", () => {
  it("returns one primary task and explains its deterministic reasons", () => {
    const queries = createExecutionExperienceQueries({
      listTasks: () => [
        {
          task: todo(),
          nodeId: "node-1",
          nodeTitle: "Hafta planı",
          workspaceId: "w",
          workspaceName: "Mint",
        },
        {
          task: todo({ id: "task-2", text: "Daha sonra yapılacak", priority: 4 }),
          nodeId: "node-2",
          nodeTitle: "Diğer",
          workspaceId: "w",
          workspaceName: "Mint",
        },
      ],
    });
    const view = queries.getExecutionNowView({
      now: Date.parse("2026-08-14T10:00:00Z"),
      timezone: "Europe/Istanbul",
      availableSlotMinutes: 30,
    });
    expect(view.primary?.taskId).toBe("task-1");
    expect(view.primary?.reasonSummaries.length).toBeGreaterThan(0);
    expect(view.alternatives.length).toBeGreaterThanOrEqual(0);
  });

  it("returns an explicit empty state when all tasks are completed", () => {
    const queries = createExecutionExperienceQueries({
      listTasks: () => [
        {
          task: todo({ done: true }),
          nodeId: "node-1",
          nodeTitle: "Hafta planı",
          workspaceId: "w",
          workspaceName: "Mint",
        },
      ],
    });
    expect(
      queries.getExecutionNowView({ now: Date.now(), timezone: "Europe/Istanbul" }).emptyReason,
    ).toBe("NO_ELIGIBLE_TASKS");
  });
});
