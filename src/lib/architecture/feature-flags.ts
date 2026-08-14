export type FeatureFlagName =
  | "applicationCommandLayer"
  | "domainEventsV1"
  | "repositoryCompatibilityLayer"
  | "smartRescheduling"
  | "persistentReminders"
  | "financeDomain"
  | "financeCapture"
  | "cashflowForecast"
  | "calendarIntegration"
  | "calendarWriteback"
  | "gmailIntegration"
  | "activityLearning"
  | "aiAssistant";

/** Safe Foundation defaults. Risky future capabilities stay off until wired. */
export const FEATURE_FLAGS: Readonly<Record<FeatureFlagName, boolean>> = {
  applicationCommandLayer: true,
  domainEventsV1: true,
  repositoryCompatibilityLayer: true,
  smartRescheduling: false,
  persistentReminders: false,
  financeDomain: false,
  financeCapture: false,
  cashflowForecast: false,
  calendarIntegration: true,
  calendarWriteback: true,
  gmailIntegration: false,
  activityLearning: false,
  aiAssistant: true,
};

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name];
}
