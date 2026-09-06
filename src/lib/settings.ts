import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings, type Settings } from "@/db/schema";
import {
  blockForDate,
  blockIsClosed,
  type EntryBlock,
} from "@/lib/entry-blocks";
import {
  addDays,
  daysBetween,
  formatIsoDateLong,
  isScorableDate,
  minutesIntoDayInZone,
  timeToMinutes,
  todayInZone,
  weekNoFor,
  type IsoDate,
} from "@/lib/dates";
import type { ScoringSettings } from "@/lib/scoring";

/**
 * Competition settings — build specification section 7.
 *
 * Single row. `rules_locked` implements V6 section 8: once true, start_date,
 * total_weeks and max_active_week become read-only.
 */

export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (!row) {
    throw new Error(
      "The settings row is missing. Run `npm run db:seed` to create it.",
    );
  }
  return row;
}

/** The subset the pure scoring function needs. */
export function toScoringSettings(row: Settings): ScoringSettings {
  return {
    startDate: row.startDate as IsoDate,
    totalWeeks: row.totalWeeks,
    maxActiveWeek: row.maxActiveWeek,
  };
}

/* ------------------------------------------------------------------ */
/* Derived state                                                       */
/* ------------------------------------------------------------------ */

export interface CompetitionClock {
  /** Today in the competition timezone. */
  today: IsoDate;
  /** The competition week containing today, or null before or after it. */
  currentWeek: number | null;
  started: boolean;
  /**
   * The 12 weeks are over — today is past the last day.
   *
   * This is not the same as the competition being closed. Nothing new can be
   * *earned* after this, but the days themselves stay open so anyone behind
   * can fill in what they missed.
   */
  weeksOver: boolean;
  /**
   * An organiser has declared it over. This is what actually shuts the doors:
   * days stop being writable and the results are final.
   */
  closed: boolean;
  /** When it was closed, for anything that needs to say so. */
  closedAt: Date | null;
  firstDay: IsoDate;
  lastDay: IsoDate;
  /** Minutes past the submission cutoff, negative while still open. */
  minutesPastCutoff: number;
  cutoffPassed: boolean;
}

export function competitionClock(
  row: Settings,
  now: Date = new Date(),
): CompetitionClock {
  const today = todayInZone(row.timezone, now);
  const firstDay = row.startDate as IsoDate;
  const lastDay = addDays(firstDay, row.totalWeeks * 7 - 1);
  const started = daysBetween(firstDay, today) >= 0;
  const weeksOver = daysBetween(today, lastDay) < 0;
  const inWindow = started && !weeksOver;

  const nowMinutes = minutesIntoDayInZone(row.timezone, now);
  const cutoffMinutes = timeToMinutes(row.submissionCutoff);

  return {
    today,
    currentWeek: inWindow ? weekNoFor(firstDay, today) : null,
    started,
    weeksOver,
    closed: row.closedAt !== null,
    closedAt: row.closedAt,
    firstDay,
    lastDay,
    minutesPastCutoff: nowMinutes - cutoffMinutes,
    cutoffPassed: nowMinutes > cutoffMinutes,
  };
}

/* ------------------------------------------------------------------ */
/* Submission and correction windows — open item O-4                   */
/* ------------------------------------------------------------------ */

export type WriteRefusal =
  | "not_started"
  | "outside_competition"
  | "future_date"
  | "block_closed"
  | "competition_closed";

export interface WritePermission {
  allowed: boolean;
  reason?: WriteRefusal;
  /** The last day of week 12. Nothing later than this is ever scorable. */
  lastScorableDay?: IsoDate;
  /** The four-week block this date belongs to, when it has one. */
  block?: EntryBlock;
}

/**
 * Whether a participant may write their own record for `entryDate`.
 *
 * BCJ fills the challenge in in four-week blocks, each with one further week
 * to catch up in: weeks 1–4 stay open through week 5, weeks 5–8 through week
 * 9, and then they are final. Somebody who joins in week 3, or falls behind in
 * week 6, has until the end of that block's catch-up week to go back — and not
 * a day longer. See lib/entry-blocks.ts for the shape of it.
 *
 * The final block has no catch-up week inside the challenge, so it is the one
 * the organisers close by hand. That is deliberate: it lets BCJ decide how long
 * the last stragglers get, and closing is also what makes the whole result
 * final.
 *
 * Two things hold regardless. A day outside the 12 weeks is never scorable, so
 * a catch-up week buys time to fill in the past rather than extra days to
 * compete on. And a day cannot be filled in before it has happened.
 *
 * The daily cutoff no longer refuses anything here. Enforcing it would be
 * theatre: a participant locked out at 23:59 could write the same day as a
 * past date the next morning, right up to the block deadline. It still governs
 * the nightly job, which is the only place it means anything.
 *
 * `settings.correction_days` no longer governs this. It is left on the row so
 * no migration is needed, and is not exposed in the settings form.
 */
export function participantMayWrite(
  row: Settings,
  entryDate: IsoDate,
  now: Date = new Date(),
): WritePermission {
  const clock = competitionClock(row, now);
  const lastScorableDay = clock.lastDay;

  if (!clock.started) return { allowed: false, reason: "not_started" };
  if (!isScorableDate(row.startDate as IsoDate, row.totalWeeks, entryDate)) {
    return { allowed: false, reason: "outside_competition" };
  }

  const age = daysBetween(entryDate, clock.today);
  if (age < 0) return { allowed: false, reason: "future_date" };

  const block =
    blockForDate(row.startDate as IsoDate, row.totalWeeks, entryDate) ??
    undefined;

  // Checked before the block deadline so that closing the competition early
  // gives one reason rather than two, and the message names the decision
  // rather than a date that has not arrived.
  if (clock.closed) {
    return {
      allowed: false,
      reason: "competition_closed",
      lastScorableDay,
      block,
    };
  }

  // This block's own deadline, which has already passed for the earlier ones.
  if (block && blockIsClosed(block, clock.today)) {
    return { allowed: false, reason: "block_closed", lastScorableDay, block };
  }

  return { allowed: true, lastScorableDay, block };
}

/**
 * Takes the whole permission rather than the reason alone: a closed block has
 * to name its own weeks and its own date, and "that is closed" without saying
 * which weeks or when is the kind of message people bring to an organiser.
 */
export function refusalMessage(
  permission: WritePermission,
  row: Settings,
): string {
  switch (permission.reason) {
    case "not_started":
      return `The challenge starts on ${row.startDate}. You can fill in your first day then.`;
    case "outside_competition":
      return "That date falls outside the 12-week challenge.";
    case "future_date":
      return "You cannot fill in a day before it happens.";
    case "block_closed": {
      const block = permission.block;
      if (!block || !block.closesAfter) {
        return "Those weeks are closed. Ask a BCJ organiser if this day needs correcting.";
      }
      return `${block.label} closed on ${formatIsoDateLong(block.closesAfter)}, so this day can no longer be changed here. Ask a BCJ organiser if it needs correcting.`;
    }
    case "competition_closed":
      return "The organisers have closed the challenge, so days can no longer be changed here. Ask a BCJ organiser if something needs correcting.";
    default:
      return "This day cannot be changed here. Ask a BCJ organiser if it needs correcting.";
  }
}
