export const NOTIFICATION_MODEL_VERSION = "NOTIFICATION_MODEL_V1" as const;

export type NotificationLevel = "NORMAL" | "PERSISTENT" | "CRITICAL";
export type NotificationSourceType =
  | "TASK"
  | "PROJECT"
  | "FINANCIAL_OBLIGATION"
  | "FINANCIAL_STATEMENT"
  | "PLANNER"
  | "ROUTINE"
  | "SYSTEM"
  | "CALENDAR"
  | "EMAIL";
export type NotificationActionType =
  | "START"
  | "DONE"
  | "SNOOZE_10_MIN"
  | "SNOOZE_30_MIN"
  | "SNOOZE_1_HOUR"
  | "CANNOT_DO_TODAY"
  | "MOVE_TO_WAITING"
  | "OPEN_TASK"
  | "OPEN_SOURCE"
  | "DISMISS"
  | "MARK_PAID"
  | "SCHEDULE_PAYMENT"
  | "OPEN_STATEMENT";
export type NotificationReasonCode =
  | "SEND_TRIGGER_CRITICAL"
  | "SEND_FOLLOW_UP_DUE"
  | "SEND_PERSISTENT_REPEAT"
  | "DEFER_QUIET_HOURS"
  | "DEFER_WORKING_HOURS"
  | "DEFER_WEEKEND"
  | "SUPPRESS_COOLDOWN"
  | "SUPPRESS_ENTITY_FATIGUE"
  | "SUPPRESS_GLOBAL_FATIGUE"
  | "SUPPRESS_ALREADY_RESOLVED"
  | "SUPPRESS_DUPLICATE"
  | "SCHEDULE_RELATIVE_REMINDER"
  | "ESCALATED_DEADLINE"
  | "ESCALATED_OVERDUE"
  | "ESCALATED_REPEATED_SNOOZE"
  | "ESCALATED_PERSISTENT_UNRESOLVED"
  | "ESCALATED_FINANCIAL_DUE"
  | "DEGRADED_PLATFORM_CAPABILITY"
  | "CANCEL_SOURCE_COMPLETED"
  | "EXPIRED";
export type NotificationDecisionKind =
  "SEND_NOW" | "SCHEDULE" | "DEFER" | "SUPPRESS" | "CANCEL_EXISTING" | "NO_ACTION";
export type NotificationHistoryStatus =
  | "PLANNED"
  | "SCHEDULED"
  | "DELIVERED"
  | "ACTIONED"
  | "DISMISSED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

export type NotificationAction = { type: NotificationActionType; label?: string };
export type NotificationCapabilities = {
  supportsActions: boolean;
  supportsPersistent: boolean;
  supportsCritical: boolean;
  supportsScheduledDelivery: boolean;
  supportsDeepLink: boolean;
  supportsExactScheduling: boolean;
};

export type RepeatPolicy = {
  intervalMinutes: number;
  maxRepeats: number;
  windowMinutes: number;
};
export type QuietHoursBehavior = "SUPPRESS" | "DEFER" | "ALLOW_CRITICAL";
export type QuietHoursPolicy = {
  startLocalTime: string;
  endLocalTime: string;
  timezone: string;
  allowedLevels: readonly NotificationLevel[];
  behavior: QuietHoursBehavior;
};
export type WorkingHoursPolicy = {
  startLocalTime: string;
  endLocalTime: string;
  timezone: string;
  allowedSources: readonly NotificationSourceType[];
  behavior: "SUPPRESS" | "DEFER";
};
export type WeekendPolicy = {
  behavior: "ALLOW" | "DEFER";
  allowedLevels: readonly NotificationLevel[];
};
export type NotificationPolicyConfig = {
  level: NotificationLevel;
  cooldownMinutes: number;
  repeat?: RepeatPolicy;
  quietHoursBehavior: QuietHoursBehavior;
  escalation?: { afterSnoozes: number; level: NotificationLevel };
  maxNotifications: number;
  expirationMinutes: number;
  actionSet: readonly NotificationActionType[];
  privacyMode?: "FULL" | "MASK_AMOUNT" | "GENERIC";
};
export type NotificationConfig = {
  version: typeof NOTIFICATION_MODEL_VERSION;
  quietHours?: QuietHoursPolicy;
  workingHours?: WorkingHoursPolicy;
  weekend?: WeekendPolicy;
  globalBudget?: { maxNonCriticalPerHour: number; maxLowPriorityPerDay: number };
  policies: Readonly<Record<NotificationLevel, NotificationPolicyConfig>>;
};

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  version: NOTIFICATION_MODEL_VERSION,
  policies: {
    NORMAL: {
      level: "NORMAL",
      cooldownMinutes: 60,
      maxNotifications: 1,
      expirationMinutes: 24 * 60,
      quietHoursBehavior: "DEFER",
      actionSet: ["OPEN_TASK", "SNOOZE_10_MIN", "SNOOZE_30_MIN", "DISMISS"],
    },
    PERSISTENT: {
      level: "PERSISTENT",
      cooldownMinutes: 30,
      maxNotifications: 6,
      expirationMinutes: 3 * 24 * 60,
      quietHoursBehavior: "DEFER",
      repeat: { intervalMinutes: 60, maxRepeats: 6, windowMinutes: 24 * 60 },
      actionSet: ["OPEN_TASK", "START", "DONE", "SNOOZE_30_MIN", "CANNOT_DO_TODAY", "DISMISS"],
    },
    CRITICAL: {
      level: "CRITICAL",
      cooldownMinutes: 15,
      maxNotifications: 4,
      expirationMinutes: 24 * 60,
      quietHoursBehavior: "ALLOW_CRITICAL",
      repeat: { intervalMinutes: 30, maxRepeats: 4, windowMinutes: 6 * 60 },
      actionSet: ["OPEN_TASK", "START", "DONE", "SNOOZE_10_MIN", "MOVE_TO_WAITING", "DISMISS"],
    },
  },
};

export const FINANCE_NOTIFICATION_POLICIES = {
  PAYMENT_STANDARD: "NORMAL",
  PAYMENT_IMPORTANT: "PERSISTENT",
  PAYMENT_CRITICAL: "CRITICAL",
} as const satisfies Record<string, NotificationLevel>;

export type NotificationIntent = {
  id: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  triggerId?: string;
  entityType: string;
  entityId: string;
  title: string;
  body?: string;
  level: NotificationLevel;
  actions: readonly NotificationAction[];
  scheduledFor?: number;
  expiresAt?: number;
  repeatPolicy?: RepeatPolicy;
  cooldownKey: string;
  dedupeKey: string;
  reasonCodes: readonly NotificationReasonCode[];
  createdAt: number;
  metadata?: Readonly<Record<string, string | number | boolean>>;
};
export type NotificationRecord = {
  id: string;
  intentId: string;
  entityType: string;
  entityId: string;
  triggerId?: string;
  level: NotificationLevel;
  scheduledFor?: number;
  deliveredAt?: number;
  dismissedAt?: number;
  actionTaken?: NotificationActionType;
  repeatIndex: number;
  dedupeKey: string;
  createdAt: number;
  status: NotificationHistoryStatus;
};

export type TriggerNotificationInput = {
  id: string;
  severity: "INFO" | "ATTENTION" | "HIGH" | "CRITICAL";
  message: string;
  reasonCodes?: readonly string[];
  sourceType?: NotificationSourceType;
  taskId?: string;
};
export type RelativeReminderAnchor =
  "DUE_AT" | "DO_AT" | "REMIND_AT" | "FOLLOW_UP_AT" | "START_AT" | "FINANCIAL_DUE_DATE";
export type RelativeReminder = {
  anchor: RelativeReminderAnchor;
  offsetMinutes: number;
  policy?: NotificationLevel;
};
export type NotificationHistoryView = Pick<
  NotificationRecord,
  "dedupeKey" | "entityId" | "level" | "createdAt" | "status" | "actionTaken" | "repeatIndex"
>;
export type NotificationDecision = {
  kind: NotificationDecisionKind;
  reasonCodes: readonly NotificationReasonCode[];
  level: NotificationLevel;
  scheduledFor?: number;
  intent?: NotificationIntent;
  effectiveCapabilities?: NotificationCapabilities;
};
export type NotificationEvaluationInput = {
  now: number;
  sourceType: NotificationSourceType;
  sourceId: string;
  entityType: string;
  entityId: string;
  title: string;
  body?: string;
  trigger?: TriggerNotificationInput;
  policy?: NotificationPolicyConfig;
  config?: NotificationConfig;
  history?: readonly NotificationHistoryView[];
  sourceResolved?: boolean;
  expiresAt?: number;
  snoozeCount?: number;
  scheduledFor?: number;
  capabilities?: NotificationCapabilities;
};

export type NotificationActionResult =
  | { status: "SUCCESS"; action: NotificationActionType; scheduledFor?: number }
  | {
      status: "REJECTED" | "STALE" | "NOT_SUPPORTED" | "ERROR";
      action: NotificationActionType;
      message: string;
    };
