import { hasIncompleteDependencies } from "@/domain/execution/dependencies";
import type { ExecutionTask } from "@/domain/execution/task";
import type { TriggerContext, TriggerReason } from "./types";

export function dependencyIndex(tasks: readonly ExecutionTask[]): Map<string, ExecutionTask> {
  return new Map(tasks.map((task) => [task.id, task]));
}

export function eligibility(
  task: ExecutionTask,
  context: TriggerContext,
  index: Map<string, ExecutionTask>,
): { eligible: boolean; reasons: TriggerReason[] } {
  const reasons: TriggerReason[] = [];
  if (["WAITING", "BLOCKED", "SOMEDAY", "DONE", "CANCELLED"].includes(task.state)) {
    reasons.push({
      code: "STATE_EXCLUDED",
      category: "EXECUTION",
      contribution: 0,
      severity: "INFO",
      message: `Durum ${task.state} olduğu için NOW adayı değil.`,
    });
  } else if (task.state === "INBOX") {
    reasons.push({
      code: "INBOX_UNORGANIZED",
      category: "EXECUTION",
      contribution: 0,
      severity: "ATTENTION",
      message: "Gelen kutusu görevi düzenlenmeden NOW adayı değildir.",
    });
  } else if (task.startAt !== undefined && task.startAt > context.now) {
    reasons.push({
      code: "FUTURE_START",
      category: "EXECUTION",
      contribution: 0,
      severity: "INFO",
      message: "Başlangıç zamanı henüz gelmedi.",
      metadata: { startAt: task.startAt },
    });
  } else if (hasIncompleteDependencies(task, (id) => index.get(id))) {
    reasons.push({
      code: "DEPENDENCY_INCOMPLETE",
      category: "DEPENDENCY",
      contribution: 0,
      severity: "HIGH",
      message: "Tamamlanmamış bağımlılığı var.",
    });
  } else {
    reasons.push({
      code: "ELIGIBLE",
      category: "EXECUTION",
      contribution: 0,
      severity: "INFO",
      message: "Yürütme için uygun durumda.",
    });
  }
  return { eligible: reasons[0]?.code === "ELIGIBLE", reasons };
}
