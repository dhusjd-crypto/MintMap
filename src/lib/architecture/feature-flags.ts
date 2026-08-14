export type FeatureFlagName =
  | "applicationCommandLayer"
  | "domainEventsV1"
  | "repositoryCompatibilityLayer"
  | "smartRescheduling"
  | "persistentReminders"
  | "notificationEngine"
  | "financeDomain"
  | "financeCapture"
  | "cashflowForecast"
  | "calendarIntegration"
  | "calendarWriteback"
  | "gmailIntegration"
  | "activityLearning"
  | "aiAssistant"
  | "canonicalPersistenceV1"
  | "executionExtensionPersistence"
  | "financePersistenceV1"
  | "migrationBackups"
  | "commandCenterV1"
  | "focusModeV1";

/** Safe Foundation defaults. Risky future capabilities stay off until wired. */
export const FEATURE_FLAGS: Readonly<Record<FeatureFlagName, boolean>> = {
  applicationCommandLayer: true,
  domainEventsV1: true,
  repositoryCompatibilityLayer: true,
  smartRescheduling: false,
  persistentReminders: false,
  notificationEngine: true,
  financeDomain: false,
  financeCapture: false,
  cashflowForecast: false,
  calendarIntegration: true,
  calendarWriteback: true,
  gmailIntegration: false,
  activityLearning: false,
  aiAssistant: true,
  canonicalPersistenceV1: true,
  executionExtensionPersistence: true,
  financePersistenceV1: true,
  migrationBackups: true,
  commandCenterV1: true,
  focusModeV1: true,
};

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name];
}
