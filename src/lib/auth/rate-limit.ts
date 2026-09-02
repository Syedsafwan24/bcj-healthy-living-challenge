import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

/**
 * Rate limiting — build specification sections 2.2, 2.3 and 11.
 *
 * Five sign-in attempts per IP per minute. This matters more than usual for
 * participants, because the registration ID is the only credential.
 *
 * Counters live in Postgres rather than in memory so the limit holds across
 * serverless instances. One row per key per minute window; the nightly job
 * clears old rows.
 */

export const ATTEMPTS_PER_MINUTE = 5;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window ends. */
  retryAfter: number;
}

function windowStart(now = new Date()): Date {
  const ms = now.getTime();
  return new Date(ms - (ms % 60_000));
}

/**
 * Records one attempt and reports whether it is allowed. The insert and the
 * increment are one statement, so two concurrent requests cannot both read a
 * stale count.
 */
export async function consumeAttempt(
  key: string,
  limit = ATTEMPTS_PER_MINUTE,
): Promise<RateLimitResult> {
  const start = windowStart();

  const rows = (await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${start.toISOString()}, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `)) as unknown as Array<{ count: number }>;

  const count = Number(rows[0]?.count ?? limit + 1);
  const retryAfter = Math.max(
    1,
    Math.ceil((start.getTime() + 60_000 - Date.now()) / 1000),
  );

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfter,
  };
}

/** Clears counters older than an hour. Called by the nightly job. */
export async function pruneRateLimits(): Promise<void> {
  await db.execute(
    sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour'`,
  );
}

export function rateLimitKey(scope: string, ip: string | null): string {
  return `${scope}:${ip ?? "unknown"}`;
}
