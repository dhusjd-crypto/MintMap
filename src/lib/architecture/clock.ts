/**
 * Deterministic time boundary for domain/application code.
 * Keep browser Date access in adapters or existing stores until migrated.
 */
export type Clock = {
  now(): number;
};

export const systemClock: Clock = {
  now: () => Date.now(),
};

export function fixedClock(timestamp: number): Clock {
  return { now: () => timestamp };
}
