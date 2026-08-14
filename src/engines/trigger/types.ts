import type { ExecutionProject } from "@/domain/execution/project";
import type { ExecutionTask, ManualPriority } from "@/domain/execution/task";

export const TRIGGER_SCORE_MODEL_VERSION = "TRIGGER_SCORE_V1" as const;
export type TriggerCategory =
  | "EXECUTION"
  | "DEADLINE"
  | "FOLLOW_UP"
  | "STALE"
  | "DEPENDENCY"
  | "CAPACITY"
  | "CALENDAR"
  | "REENTRY"
  | "PROJECT"
  | "PLANNING";
export type TriggerSeverity = "INFO" | "ATTENTION" | "HIGH" | "CRITICAL";
export type TriggerEvaluationStatus = "TRIGGERED" | "NOT_TRIGGERED" | "NOT_EVALUATED";
export type TriggerReasonCode =
  | "ELIGIBLE"
  | "STATE_EXCLUDED"
  | "INBOX_UNORGANIZED"
  | "FUTURE_START"
  | "DEPENDENCY_INCOMPLETE"
  | "DEADLINE_OVERDUE"
  | "DEADLINE_HOURS"
  | "DEADLINE_TODAY"
  | "DEADLINE_TOMORROW"
  | "DEADLINE_3_DAYS"
  | "DEADLINE_7_DAYS"
  | "NO_DEADLINE"
  | "IMPORTANCE"
  | "BLOCKS_WORK"
  | "PLANNED_TODAY"
  | "STALE"
  | "SNOOZE_PRESSURE"
  | "ACTIVE_CONTINUITY"
  | "FITS_SLOT"
  | "DOES_NOT_FIT_SLOT"
  | "FOLLOW_UP_DUE"
  | "NOTIFICATION_FATIGUE"
  | "CAPACITY_CONTEXT_MISSING"
  | "CALENDAR_CONTEXT_MISSING"
  | "SIGNAL_VERIFIED";

export type TriggerReason = {
  code: TriggerReasonCode;
  category: TriggerCategory;
  contribution: number;
  severity: TriggerSeverity;
  message: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type TriggerSignal = {
  id: string;
  category: TriggerCategory;
  status: TriggerEvaluationStatus;
  severity: TriggerSeverity;
  taskId?: string;
  message: string;
  reasonCodes: readonly TriggerReasonCode[];
  metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type TriggerConfig = {
  version: typeof TRIGGER_SCORE_MODEL_VERSION;
  staleAfterDays: readonly [number, number, number, number];
  snoozeWarningAt: number;
  snoozeDecisionAt: number;
  tomorrowPlanningHour: number;
  maxTopToday: number;
  weights: Readonly<{
    deadline: number;
    importance: number;
    blocks: number;
    plannedToday: number;
    stale: number;
    snooze: number;
    active: number;
    fitsSlot: number;
    followUp: number;
    fatigue: number;
    doesNotFitSlot: number;
  }>;
};

export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  version: TRIGGER_SCORE_MODEL_VERSION,
  staleAfterDays: [3, 7, 14, 30],
  snoozeWarningAt: 3,
  snoozeDecisionAt: 5,
  tomorrowPlanningHour: 18,
  maxTopToday: 3,
  weights: {
    deadline: 30,
    importance: 20,
    blocks: 15,
    plannedToday: 10,
    stale: 12,
    snooze: 10,
    active: 8,
    fitsSlot: 8,
    followUp: 15,
    fatigue: -15,
    doesNotFitSlot: -10,
  },
};

export type CalendarAvailabilitySignal = {
  verified: boolean;
  availableMinutes: number;
  startsAt?: number;
  endsAt?: number;
};
export type TriggerContext = {
  now: number;
  timezone: string;
  availableSlotMinutes?: number;
  availableMinutesToday?: number;
  plannedMinutesToday?: number;
  overcommitMinutes?: number;
  currentActiveTaskId?: string;
  lastActiveAt?: number;
  lastTomorrowPlanAt?: number;
  calendar?: CalendarAvailabilitySignal;
  meetingCancelled?: { verified: boolean; meetingId?: string };
  scheduleChanged?: { verified: boolean; requiresReplan: boolean; reason?: string };
  planningRisks?: readonly {
    taskId: string;
    requiredMinutes: number;
    availableMinutes: number;
    deficitMinutes: number;
  }[];
  config?: Partial<TriggerConfig> & { weights?: Partial<TriggerConfig["weights"]> };
  projects?: readonly ExecutionProject[];
  projectSignals?: Readonly<Record<string, { stale?: boolean; noNextAction?: boolean }>>;
};

export type TaskTriggerEvaluation = {
  taskId: string;
  eligible: boolean;
  score: number;
  scoreModelVersion: typeof TRIGGER_SCORE_MODEL_VERSION;
  reasons: readonly TriggerReason[];
  signals: readonly TriggerSignal[];
};
export type TriggerResults = {
  evaluatedAt: number;
  scoreModelVersion: typeof TRIGGER_SCORE_MODEL_VERSION;
  evaluations: readonly TaskTriggerEvaluation[];
  signals: readonly TriggerSignal[];
};
export type ReEntryPlan = {
  createdAt: number;
  taskIds: readonly string[];
  waitingFollowUpIds: readonly string[];
  quickWinIds: readonly string[];
  staleProjectIds: readonly string[];
  deadlineRiskIds: readonly string[];
};
export type TriggerSystemInput = { tasks: readonly ExecutionTask[]; context: TriggerContext };

export type TriggerSelector = (
  tasks: readonly ExecutionTask[],
  context: TriggerContext,
  results?: TriggerResults,
) => ExecutionTask[];
export type PriorityValue = ManualPriority | undefined;
