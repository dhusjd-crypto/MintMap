import type { ExecutionTask } from "@/domain/execution/task";
import type { PlanResult } from "@/domain/planning";

export const ROUTINE_MODEL_VERSION = "ROUTINE_MODEL_V1" as const;
export type RoutineType =
  | "MORNING_PLANNING"
  | "MIDDAY_RECALIBRATION"
  | "EVENING_SHUTDOWN"
  | "TOMORROW_PLANNING"
  | "WEEKLY_REVIEW"
  | "WEEK_AHEAD_PLANNING"
  | "REENTRY_RESET";
export type RoutineSessionStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "SKIPPED" | "CANCELLED";
export type RoutineSkipReason = "NO_TIME" | "NOT_NEEDED" | "DO_LATER" | "OTHER";
export type RoutineSession = {
  id: string;
  type: RoutineType;
  status: RoutineSessionStatus;
  localDate: string;
  startedAt?: number;
  completedAt?: number;
  stepId?: string;
  stepResults?: Readonly<Record<string, string | number | boolean | string[]>>;
  skipReason?: RoutineSkipReason;
  createdAt: number;
  updatedAt: number;
  modelVersion: typeof ROUTINE_MODEL_VERSION;
  metadata?: Readonly<Record<string, string | number | boolean>>;
};
export type RoutineConfig = {
  morningPlanningEnabled: boolean;
  morningWindow: readonly [number, number];
  middayEnabled: boolean;
  middayWindow: readonly [number, number];
  eveningShutdownEnabled: boolean;
  eveningWindow: readonly [number, number];
  tomorrowPlanningEnabled: boolean;
  tomorrowPlanningTime: number;
  weeklyReviewEnabled: boolean;
  weeklyReviewDay: number;
  weeklyReviewWindow: readonly [number, number];
  reentryInactivityThresholdDays: number;
  missedRoutineGraceMinutes: number;
};
export const DEFAULT_ROUTINE_CONFIG: RoutineConfig = {
  morningPlanningEnabled: true,
  morningWindow: [6, 12],
  middayEnabled: true,
  middayWindow: [12, 16],
  eveningShutdownEnabled: true,
  eveningWindow: [20, 24],
  tomorrowPlanningEnabled: true,
  tomorrowPlanningTime: 22,
  weeklyReviewEnabled: true,
  weeklyReviewDay: 0,
  weeklyReviewWindow: [9, 22],
  reentryInactivityThresholdDays: 3,
  missedRoutineGraceMinutes: 120,
};
export type RolloverDecisionType =
  "MOVE_TO_TOMORROW" | "RESCHEDULE" | "WAITING" | "SOMEDAY" | "CANCEL" | "KEEP_UNSCHEDULED";
export type RolloverDecision = {
  id: string;
  taskId: string;
  fromDate: string;
  decision: RolloverDecisionType;
  targetDate?: string;
  reason?: string;
  createdAt: number;
  modelVersion: typeof ROUTINE_MODEL_VERSION;
};
export type ReviewCapacity = Pick<
  PlanResult["capacity"],
  "availableMinutes" | "plannedTaskMinutes" | "remainingMinutes" | "overcommitMinutes"
>;
export type MorningPlanResult = {
  localDate: string;
  leftovers: ExecutionTask[];
  top3: ExecutionTask[];
  dueFollowUps: ExecutionTask[];
  deadlineRisks: ExecutionTask[];
  capacity?: ReviewCapacity;
  warnings: string[];
};
export type ReviewSummary = {
  type: RoutineType;
  localDate: string;
  title: string;
  primaryItems: ExecutionTask[];
  secondaryItems: ExecutionTask[];
  warnings: string[];
  capacity?: ReviewCapacity;
  recommendedAction: "REVIEW" | "START" | "PLAN" | "CLOSE" | "NONE";
};
