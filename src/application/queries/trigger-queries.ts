import type { CanonicalExecutionTaskRepository } from "../repositories/canonical-execution-repository";
import { triggerEngine } from "@/engines/trigger";
import {
  getBestNowTask,
  getTop3Today,
  getWaitingFollowUps,
  getDeadlineRisks,
  createReEntryPlan,
} from "@/engines/trigger";
import type { TriggerContext } from "@/engines/trigger";

export function createTriggerQueries(repository: CanonicalExecutionTaskRepository) {
  const evaluate = async (context: TriggerContext) => {
    const records = await repository.list();
    const tasks = records.map((record) => record.canonical);
    return { tasks, results: triggerEngine.evaluateTasks(tasks, context) };
  };
  return {
    getBestNowTask: async (context: TriggerContext) => {
      const { tasks, results } = await evaluate(context);
      return getBestNowTask(tasks, context, results);
    },
    getTop3Today: async (context: TriggerContext) => {
      const { tasks, results } = await evaluate(context);
      return getTop3Today(tasks, context, results);
    },
    getWaitingFollowUps: async (context: TriggerContext) => {
      const { tasks } = await evaluate(context);
      return getWaitingFollowUps(tasks, context);
    },
    getDeadlineRisks: async (context: TriggerContext) => {
      const { tasks, results } = await evaluate(context);
      return getDeadlineRisks(tasks, context, results);
    },
    getReEntryPlan: async (context: TriggerContext) => {
      const { tasks, results } = await evaluate(context);
      return createReEntryPlan(tasks, context, results);
    },
  };
}
