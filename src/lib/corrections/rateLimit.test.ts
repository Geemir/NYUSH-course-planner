import { describe, expect, it } from "vitest";
import { createMemoryCorrectionRateLimiter } from "@/lib/corrections/rateLimit";

describe("correction rate limiter", () => {
  it("limits report creation per authenticated user and resets by window", async () => {
    let time = 0;
    const limiter = createMemoryCorrectionRateLimiter(() => time);
    for (let index = 0; index < 10; index += 1) expect((await limiter.check("user", "create")).allowed).toBe(true);
    expect(await limiter.check("user", "create")).toMatchObject({ allowed: false, retryAfter: 3600 });
    expect((await limiter.check("other", "create")).allowed).toBe(true);
    time = 3_600_001;
    expect((await limiter.check("user", "create")).allowed).toBe(true);
  });
  it("tracks message and creation budgets independently", async () => {
    const limiter = createMemoryCorrectionRateLimiter(() => 0);
    for (let index = 0; index < 30; index += 1) expect((await limiter.check("user", "message")).allowed).toBe(true);
    expect((await limiter.check("user", "message")).allowed).toBe(false);
    expect((await limiter.check("user", "create")).allowed).toBe(true);
  });
});
