import type { ExecutionTask } from "@/domain/execution/task";

export const PLANNER_MODEL_VERSION = "PLANNER_MODEL_V1" as const;
export type TimeBlockType = "TASK" | "FIXED_EVENT" | "BUFFER" | "BREAK" | "FOCUS" | "MANUAL";
export type TimeBlockStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "SKIPPED" | "CANCELLED";
export type LockState = "UNLOCKED" | "SOFT_LOCKED" | "LOCKED";
export type BlockSource = "PLANNER" | "MANUAL" | "CALENDAR" | "SYSTEM";
export type PlanningWindowType = "DEEP_WORK" | "NORMAL" | "ADMIN" | "LOW_ENERGY" | "PHONE" | "ANY";
export type PlanningWindowSource =
  "MANUAL" | "WORKING_HOURS" | "CALENDAR_FREE" | "MEETING_CANCELLED" | "SYSTEM";
export type DailyPlanStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export type TimeBlock = {
  id: string;
  taskId?: string;
  type: TimeBlockType;
  startAt: number;
  endAt: number;
  durationMinutes: number;
  status: TimeBlockStatus;
  lockState: LockState;
  source: BlockSource;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};

export type PlanningWindow = {
  id: string;
  startAt: number;
  endAt: number;
  type: PlanningWindowType;
  source: PlanningWindowSource;
  lockState?: LockState;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BufferPolicy =
  | { kind: "NONE" }
  | { kind: "FIXED_MINUTES"; minutes: number }
  | { kind: "PERCENTAGE"; percentage: number };

export type LockHorizonPolicy = {
  nextHours: number;
  today: LockState;
  tomorrow: LockState;
  future: LockState;
};

export type PlanningConfig = {
  version: typeof PLANNER_MODEL_VERSION;
  bufferPolicy: BufferPolicy;
  lockHorizon: LockHorizonPolicy;
  minimumUsefulWindowMinutes: number;
  planningGranularityMinutes: number;
  maxDailyUtilization?: number;
};

export const DEFAULT_PLANNING_CONFIG: PlanningConfig = {
  version: PLANNER_MODEL_VERSION,
  bufferPolicy: { kind: "PERCENTAGE", percentage: 10 },
  lockHorizon: { nextHours: 2, today: "SOFT_LOCKED", tomorrow: "UNLOCKED", future: "UNLOCKED" },
  minimumUsefulWindowMinutes: 15,
  planningGranularityMinutes: 5,
  maxDailyUtilization: 1,
};

export type PriorityReason = { code: string; contribution?: number; message?: string };
export type PlanningCandidate = {
  task: Pick<
    ExecutionTask,
    | "id"
    | "estimatedMinutes"
    | "minChunkMinutes"
    | "maxChunkMinutes"
    | "splittable"
    | "dueAt"
    | "doAt"
    | "startAt"
    | "state"
    | "manualPriority"
    | "energyRequirement"
    | "context"
    | "createdAt"
  >;
  priorityScore: number;
  priorityReasons: readonly PriorityReason[];
  manualLocked?: boolean;
};

export type CapacityWarningCode =
  | "INSUFFICIENT_CONTEXT"
  | "OVERCOMMITTED"
  | "ESTIMATE_REQUIRED"
  | "OVERLAPPING_WINDOWS"
  | "LOCKED_BLOCK_CONFLICT";
export type CapacityWarning = {
  code: CapacityWarningCode;
  message: string;
  metadata?: Readonly<Record<string, number | string>>;
};
export type DailyCapacity = {
  availableMinutes: number;
  fixedMinutes: number;
  bufferMinutes: number;
  plannedTaskMinutes: number;
  remainingMinutes: number;
  overcommitMinutes: number;
  utilizationRatio?: number;
  estimatedFinishTime?: number;
  tasksAtRisk: readonly DeadlinePlanningRisk[];
  warnings: readonly CapacityWarning[];
};

export type OvercommitResult = {
  overcommitMinutes: number;
  movableTaskIds: readonly string[];
  reason: "OVERCOMMITTED" | "WITHIN_CAPACITY";
};
export type DeadlinePlanningRisk = {
  taskId: string;
  dueAt: number;
  requiredMinutes: number;
  availableMinutes: number;
  deficitMinutes: number;
  severity: "ATTENTION" | "HIGH" | "CRITICAL";
};
export type UnscheduledTask = { taskId: string; reasonCode: string; message: string };
export type ScheduledAllocation = {
  taskId: string;
  blockIds: readonly string[];
  allocatedMinutes: number;
  reasonCodes: readonly string[];
};
export type DailyPlan = {
  id: string;
  localDate: string;
  timezone: string;
  timeBlocks: readonly TimeBlock[];
  createdAt: number;
  updatedAt: number;
  status: DailyPlanStatus;
  revision: number;
};
export type PlannerInput = {
  now: number;
  timezone: string;
  localDate: string;
  windows: readonly PlanningWindow[];
  candidates: readonly PlanningCandidate[];
  existingBlocks?: readonly TimeBlock[];
  fixedBlocks?: readonly TimeBlock[];
  config?: Partial<PlanningConfig> & {
    bufferPolicy?: BufferPolicy;
    lockHorizon?: Partial<LockHorizonPolicy>;
  };
  previousPlan?: DailyPlan;
};
export type PlanResult = {
  dailyPlan: DailyPlan;
  capacity: DailyCapacity;
  overcommit: OvercommitResult;
  scheduled: readonly ScheduledAllocation[];
  unscheduled: readonly UnscheduledTask[];
  warnings: readonly CapacityWarning[];
  generatedAt: number;
  plannerModelVersion: typeof PLANNER_MODEL_VERSION;
};
export type PlanDiff = {
  preservedBlockIds: readonly string[];
  addedBlockIds: readonly string[];
  removedBlockIds: readonly string[];
  movedBlockIds: readonly string[];
  warnings: readonly CapacityWarning[];
};
