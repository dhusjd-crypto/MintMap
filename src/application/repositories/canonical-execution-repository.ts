import type {
  ExecutionTask,
  EnergyRequirement,
  ManualPriority,
  NotificationPolicy,
  TaskDependency,
  TaskState,
} from "@/domain/execution/task";
import type { Todo } from "@/lib/mindmap-store";
import { domainTaskToLegacyPatch, legacyTaskToDomainTask } from "../mapping/execution-task-mapping";
import type { TaskRepository, TaskRecord } from "./task-repository";
import { canonicalStorage } from "@/lib/canonical-persistence/storage";
import type { CanonicalStorage, PersistenceEnvelope } from "@/lib/canonical-persistence/types";

export type ExecutionTaskExtension = {
  taskId: string;
  schemaVersion: number;
  updatedAt?: number;
  state?: TaskState;
  startAt?: number;
  doAt?: number;
  softEndAt?: number;
  dueAt?: number;
  followUpAt?: number;
  estimatedMinutes?: number;
  actualMinutes?: number;
  minChunkMinutes?: number;
  maxChunkMinutes?: number;
  splittable?: boolean;
  waitingFor?: string;
  waitingReason?: string;
  blockedBy?: TaskDependency[];
  blocks?: TaskDependency[];
  manualPriority?: ManualPriority;
  strategicWeight?: number;
  impact?: number;
  energyRequirement?: EnergyRequirement;
  context?: string;
  notificationPolicy?: NotificationPolicy;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
};

export type CanonicalTaskRecord = TaskRecord & { canonical: ExecutionTask };

function extensionEnvelope(
  value: ExecutionTaskExtension,
  previous?: PersistenceEnvelope<ExecutionTaskExtension>,
): PersistenceEnvelope<ExecutionTaskExtension> {
  const now = Date.now();
  return {
    id: value.taskId,
    entityType: "ExecutionTaskExtension",
    schemaVersion: value.schemaVersion,
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    payload: structuredClone(value),
  };
}

function extensionFromTask(task: ExecutionTask): ExecutionTaskExtension {
  return {
    taskId: task.id,
    schemaVersion: 1,
    updatedAt: task.updatedAt,
    state: task.state,
    startAt: task.startAt,
    doAt: task.doAt,
    softEndAt: task.softEndAt,
    dueAt: task.dueAt,
    followUpAt: task.followUpAt,
    estimatedMinutes: task.estimatedMinutes,
    actualMinutes: task.actualMinutes,
    minChunkMinutes: task.minChunkMinutes,
    maxChunkMinutes: task.maxChunkMinutes,
    splittable: task.splittable,
    waitingFor: task.waitingFor,
    waitingReason: task.waitingReason,
    blockedBy: task.blockedBy,
    blocks: task.blocks,
    manualPriority: task.manualPriority,
    strategicWeight: task.strategicWeight,
    impact: task.impact,
    energyRequirement: task.energyRequirement,
    context: task.context,
    notificationPolicy: task.notificationPolicy,
    sourceType: task.sourceType,
    sourceId: task.sourceId,
    metadata: task.metadata,
  };
}

function compose(legacy: ExecutionTask, extension?: ExecutionTaskExtension): ExecutionTask {
  if (!extension) return legacy;
  return {
    ...legacy,
    ...extension,
    id: legacy.id,
    title: legacy.title,
    description: legacy.description,
    createdAt: legacy.createdAt,
    updatedAt: Math.max(legacy.updatedAt, extension.updatedAt ?? legacy.updatedAt),
    lastTouchedAt: Math.max(legacy.lastTouchedAt, extension.updatedAt ?? legacy.lastTouchedAt),
    snoozeCount: legacy.snoozeCount,
    notificationCount: legacy.notificationCount,
    metadata: { ...legacy.metadata, ...(extension.metadata ?? {}) },
  };
}

export class PersistenceWriteError extends Error {
  constructor(
    readonly taskId: string,
    readonly phase: "extension" | "legacy",
    cause: unknown,
  ) {
    super(`Görev kalıcı yazımı ${phase} aşamasında başarısız oldu.`, { cause });
    this.name = "PersistenceWriteError";
  }
}

export class CanonicalExecutionTaskRepository {
  constructor(
    private readonly legacy: TaskRepository,
    private readonly storage: CanonicalStorage = canonicalStorage,
  ) {}

  async get(id: string): Promise<CanonicalTaskRecord | undefined> {
    const record = this.legacy.get(id);
    if (!record) return undefined;
    const extension = await this.storage.get<ExecutionTaskExtension>("execution_extensions", id);
    return {
      ...record,
      canonical: compose(legacyTaskToDomainTask(record.task), extension?.payload),
    };
  }

  async list(): Promise<CanonicalTaskRecord[]> {
    const records = this.legacy.list();
    const extensions = new Map(
      (await this.storage.list<ExecutionTaskExtension>("execution_extensions")).map((entry) => [
        entry.id,
        entry.payload,
      ]),
    );
    return records.map((record) => ({
      ...record,
      canonical: compose(legacyTaskToDomainTask(record.task), extensions.get(record.task.id)),
    }));
  }

  /** Writes the extension first, then the compatible legacy patch. Events belong after this resolves. */
  async save(task: ExecutionTask): Promise<CanonicalTaskRecord | undefined> {
    const current = this.legacy.get(task.id);
    if (!current) return undefined;
    const previous = await this.storage.get<ExecutionTaskExtension>(
      "execution_extensions",
      task.id,
    );
    try {
      await this.storage.put(
        "execution_extensions",
        extensionEnvelope(extensionFromTask(task), previous),
      );
    } catch (error) {
      throw new PersistenceWriteError(task.id, "extension", error);
    }
    try {
      const patch = domainTaskToLegacyPatch(task, current.task);
      if (Object.keys(patch).length) this.legacy.update(task.id, patch);
    } catch (error) {
      try {
        await this.storage.put("persistence_operations", {
          id: `execution:${task.id}:${Date.now()}`,
          entityType: "PersistenceOperation",
          schemaVersion: 1,
          revision: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          payload: {
            taskId: task.id,
            status: "FAILED",
            phase: "legacy",
            retryable: true,
            error: String(error),
          },
        });
      } catch {
        // The original legacy record and the canonical extension remain intact.
      }
      throw new PersistenceWriteError(task.id, "legacy", error);
    }
    return this.get(task.id);
  }

  async saveExtension(taskId: string, patch: Partial<ExecutionTaskExtension>) {
    const current = await this.storage.get<ExecutionTaskExtension>("execution_extensions", taskId);
    const next: ExecutionTaskExtension = {
      ...(current?.payload ?? { taskId, schemaVersion: 1 }),
      ...patch,
      taskId,
      schemaVersion: 1,
    };
    await this.storage.put("execution_extensions", extensionEnvelope(next, current));
  }
}

export function canonicalTaskToTodoPatch(task: ExecutionTask, current: Todo): Partial<Todo> {
  return domainTaskToLegacyPatch(task, current);
}
