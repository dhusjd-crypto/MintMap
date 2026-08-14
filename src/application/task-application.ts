import { systemClock } from "@/lib/architecture/clock";
import { isFeatureEnabled } from "@/lib/architecture/feature-flags";
import { LocalDomainEventDispatcher } from "./events/dispatcher";
import { createTaskCommands } from "./commands/task-commands";
import { createTaskQueries } from "./queries/task-queries";
import { LegacyGoalRepository } from "./repositories/goal-repository";
import { LegacyProjectRepository } from "./repositories/project-repository";
import { LegacyTaskRepository } from "./repositories/task-repository";

const tasks = new LegacyTaskRepository();
const projects = new LegacyProjectRepository();
const goals = new LegacyGoalRepository();
export const taskEvents = new LocalDomainEventDispatcher();

export const taskApplication = {
  features: {
    commandLayer: isFeatureEnabled("applicationCommandLayer"),
    domainEvents: isFeatureEnabled("domainEventsV1"),
    repositoryCompatibility: isFeatureEnabled("repositoryCompatibilityLayer"),
  },
  commands: createTaskCommands({
    tasks,
    clock: systemClock,
    events: (event) => taskEvents.emit(event),
  }),
  queries: createTaskQueries({ tasks, projects, goals }),
  repositories: { tasks, projects, goals },
};
