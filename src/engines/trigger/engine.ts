import type { ExecutionTask } from "@/domain/execution/task";
import { resolveTriggerConfig } from "./config";
import { dependencyIndex, eligibility } from "./eligibility";
import { scoreTask } from "./scoring";
import { systemSignals, signalsForTask } from "./triggers";
import type {
  TriggerContext,
  TriggerResults,
  TaskTriggerEvaluation,
  TriggerSystemInput,
} from "./types";

export class TriggerEngine {
  evaluateTask(
    task: ExecutionTask,
    context: TriggerContext,
    allTasks: readonly ExecutionTask[] = [task],
    downstreamCounts?: { total: number; important: number },
  ): TaskTriggerEvaluation {
    const config = resolveTriggerConfig(context.config);
    const eligibilityResult = eligibility(task, context, dependencyIndex(allTasks));
    const scored = scoreTask(
      task,
      allTasks,
      context,
      config,
      downstreamCounts?.total,
      downstreamCounts?.important,
    );
    const taskSignals = signalsForTask(task, context, config);
    return {
      taskId: task.id,
      eligible: eligibilityResult.eligible,
      score: eligibilityResult.eligible ? scored.score : 0,
      scoreModelVersion: config.version,
      reasons: [...eligibilityResult.reasons, ...scored.reasons],
      signals: taskSignals,
    };
  }
  evaluateTasks(tasks: readonly ExecutionTask[], context: TriggerContext): TriggerResults {
    const config = resolveTriggerConfig(context.config);
    const downstreamCounts = new Map<string, { total: number; important: number }>();
    for (const task of tasks) {
      for (const dependency of task.blockedBy) {
        const current = downstreamCounts.get(dependency.taskId) ?? { total: 0, important: 0 };
        current.total += 1;
        if (task.manualPriority === "HIGH" || task.manualPriority === "CRITICAL")
          current.important += 1;
        downstreamCounts.set(dependency.taskId, current);
      }
    }
    const evaluations = tasks.map((task) =>
      this.evaluateTask(task, context, tasks, downstreamCounts.get(task.id)),
    );
    return {
      evaluatedAt: context.now,
      scoreModelVersion: config.version,
      evaluations,
      signals: [
        ...evaluations.flatMap((item) => item.signals),
        ...systemSignals(tasks, context, config),
      ],
    };
  }
  evaluateSystem(input: TriggerSystemInput) {
    return this.evaluateTasks(input.tasks, input.context);
  }
}

export const triggerEngine = new TriggerEngine();
