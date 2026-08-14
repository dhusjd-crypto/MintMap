import type {
  NotificationCapabilities,
  NotificationConfig,
  NotificationLevel,
  NotificationPolicyConfig,
} from "@/domain/notification";
import { DEFAULT_NOTIFICATION_CONFIG, NOTIFICATION_MODEL_VERSION } from "@/domain/notification";

export function resolveNotificationConfig(config?: NotificationConfig) {
  if (!config) return DEFAULT_NOTIFICATION_CONFIG;
  if (config.version !== NOTIFICATION_MODEL_VERSION)
    throw new Error("Desteklenmeyen bildirim modeli sürümü.");
  return {
    ...DEFAULT_NOTIFICATION_CONFIG,
    ...config,
    policies: { ...DEFAULT_NOTIFICATION_CONFIG.policies, ...config.policies },
  };
}
export function policyForLevel(
  config: NotificationConfig,
  level: NotificationLevel,
): NotificationPolicyConfig {
  return config.policies[level];
}
export function effectiveCapabilities(
  capabilities: NotificationCapabilities | undefined,
  desired: NotificationLevel,
): NotificationCapabilities | undefined {
  if (!capabilities) return undefined;
  return capabilities;
}
