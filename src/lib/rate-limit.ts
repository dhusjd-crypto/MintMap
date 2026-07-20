// Sliding-window rate limiter for the AI server functions.
//
// Auth alone only proves *someone* logged in — since the app ships a single
// shared password, one logged-in session can still hammer the paid AI endpoints
// and burn the owner's quota. This caps how fast that can happen.
//
// State is in-memory, so the limit is per server instance: fine for the
// single-instance deploy this app targets, but a multi-instance setup would
// need shared storage (Redis) to be exact.

export type RateLimitResult = {
  allowed: boolean;
  /** Requests left in the current window (0 when blocked). */
  remaining: number;
  /** Milliseconds until the window frees up. 0 when allowed. */
  retryAfterMs: number;
};

export type RateLimiter = {
  check: (key: string, now?: number) => RateLimitResult;
  reset: () => void;
};

/**
 * @param limit   max requests allowed per window
 * @param windowMs length of the sliding window
 */
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key, now = Date.now()) {
      const cutoff = now - windowMs;
      // Drop timestamps that slid out of the window before deciding.
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

      if (recent.length >= limit) {
        hits.set(key, recent);
        return {
          allowed: false,
          remaining: 0,
          // The oldest hit is the one whose expiry frees a slot.
          retryAfterMs: recent[0] + windowMs - now,
        };
      }

      recent.push(now);
      hits.set(key, recent);

      // Opportunistic cleanup so idle keys don't accumulate forever.
      if (hits.size > 1000) {
        for (const [k, v] of hits) {
          if (!v.some((t) => t > cutoff)) hits.delete(k);
        }
      }

      return { allowed: true, remaining: limit - recent.length, retryAfterMs: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}
