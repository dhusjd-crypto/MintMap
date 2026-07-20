import { describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit inside one window", () => {
    const rl = createRateLimiter(3, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 100).allowed).toBe(true);
    expect(rl.check("a", 200).allowed).toBe(true);
  });

  it("blocks the request past the limit", () => {
    const rl = createRateLimiter(2, 1000);
    rl.check("a", 0);
    rl.check("a", 10);
    const r = rl.check("a", 20);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("reports how long until a slot frees up", () => {
    const rl = createRateLimiter(1, 1000);
    rl.check("a", 500);
    // The single hit at t=500 expires at t=1500; asking at t=700 waits 800ms.
    expect(rl.check("a", 700).retryAfterMs).toBe(800);
  });

  it("counts down remaining within the window", () => {
    const rl = createRateLimiter(3, 1000);
    expect(rl.check("a", 0).remaining).toBe(2);
    expect(rl.check("a", 1).remaining).toBe(1);
    expect(rl.check("a", 2).remaining).toBe(0);
  });

  it("lets the window slide — old hits stop counting", () => {
    const rl = createRateLimiter(2, 1000);
    rl.check("a", 0);
    rl.check("a", 100);
    expect(rl.check("a", 200).allowed).toBe(false);
    // t=1050 is past the t=0 hit's expiry, so one slot is free again.
    expect(rl.check("a", 1050).allowed).toBe(true);
  });

  it("keeps separate buckets per key", () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("b", 0).allowed).toBe(true);
    expect(rl.check("a", 1).allowed).toBe(false);
  });

  it("does not let blocked attempts extend the block", () => {
    const rl = createRateLimiter(1, 1000);
    rl.check("a", 0);
    // Hammering while blocked must not push the retry window further out.
    rl.check("a", 100);
    rl.check("a", 200);
    expect(rl.check("a", 300).retryAfterMs).toBe(700);
    expect(rl.check("a", 1001).allowed).toBe(true);
  });

  it("reset clears all buckets", () => {
    const rl = createRateLimiter(1, 1000);
    rl.check("a", 0);
    expect(rl.check("a", 1).allowed).toBe(false);
    rl.reset();
    expect(rl.check("a", 2).allowed).toBe(true);
  });
});
