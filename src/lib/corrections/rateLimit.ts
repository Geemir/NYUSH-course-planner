import { and, eq, gt, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/repository";

export type CorrectionRateAction = "create" | "message";
export interface RateLimitResult { allowed: boolean; retryAfter: number }
export interface CorrectionRateLimiter { check(userId: string, action: CorrectionRateAction): Promise<RateLimitResult> }

const LIMITS: Record<CorrectionRateAction, { count: number; windowMs: number }> = {
  create: { count: 10, windowMs: 60 * 60 * 1000 },
  message: { count: 30, windowMs: 60 * 60 * 1000 },
};

export function createMemoryCorrectionRateLimiter(now: () => number = Date.now): CorrectionRateLimiter {
  const entries = new Map<string, number[]>();
  return {
    async check(userId, action) {
      const policy = LIMITS[action];
      const key = `${userId}:${action}`;
      const current = now();
      const recent = (entries.get(key) ?? []).filter((time) => current - time < policy.windowMs);
      if (recent.length >= policy.count) return { allowed: false, retryAfter: Math.max(1, Math.ceil((policy.windowMs - (current - recent[0])) / 1000)) };
      recent.push(current);
      entries.set(key, recent);
      return { allowed: true, retryAfter: 0 };
    },
  };
}

export function createDatabaseCorrectionRateLimiter(db: Db): CorrectionRateLimiter {
  return {
    async check(userId, action) {
      const policy = LIMITS[action];
      const since = new Date(Date.now() - policy.windowMs);
      const rows = action === "create"
        ? await db.select({ count: sql<number>`count(*)::int` }).from(schema.correctionRequest).where(and(eq(schema.correctionRequest.userId, userId), gt(schema.correctionRequest.createdAt, since)))
        : await db.select({ count: sql<number>`count(*)::int` }).from(schema.correctionMessage).where(and(eq(schema.correctionMessage.authorUserId, userId), gt(schema.correctionMessage.createdAt, since)));
      return rows[0].count >= policy.count ? { allowed: false, retryAfter: Math.ceil(policy.windowMs / 1000) } : { allowed: true, retryAfter: 0 };
    },
  };
}
