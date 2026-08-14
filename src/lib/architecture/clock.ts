/**
 * Deterministic time boundary for domain/application code.
 * Keep browser Date access in adapters or existing stores until migrated.
 */
export type Clock = {
  now(): Date;
  nowMs(): number;
};

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
};

export function fixedClock(timestamp: number): Clock {
  return {
    now: () => new Date(timestamp),
    nowMs: () => timestamp,
  };
}

export const testClock = fixedClock;
