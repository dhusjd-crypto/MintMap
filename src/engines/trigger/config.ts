import { DEFAULT_TRIGGER_CONFIG, TRIGGER_SCORE_MODEL_VERSION, type TriggerConfig } from "./types";

export function resolveTriggerConfig(input?: Partial<TriggerConfig>): TriggerConfig {
  const candidate = input ?? DEFAULT_TRIGGER_CONFIG;
  return {
    ...DEFAULT_TRIGGER_CONFIG,
    ...candidate,
    weights: { ...DEFAULT_TRIGGER_CONFIG.weights, ...(candidate.weights ?? {}) },
    staleAfterDays: candidate.staleAfterDays ?? DEFAULT_TRIGGER_CONFIG.staleAfterDays,
    version: TRIGGER_SCORE_MODEL_VERSION,
  };
}
