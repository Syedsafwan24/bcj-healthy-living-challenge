import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings, type Settings } from "@/db/schema";
import {
  addDays,
  daysBetween,
  isScorableDate,
  formatTime,
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
  finished: boolean;
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
  const finished = daysBetween(today, lastDay) < 0;
  const inWindow = started && !finished;

  const nowMinutes = minutesIntoDayInZone(row.timezone, now);
  const cutoffMinutes = timeToMinutes(row.submissionCutoff);

  return {
    today,
    currentWeek: inWindow ? weekNoFor(firstDay, today) : null,
    started,
    finished,
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
  | "cutoff_passed"
  | "challenge_finished";

export interface WritePermission {
  allowed: boolean;
  reason?: WriteRefusal;
  /** Last date on which this entry may still be filled in or corrected. */
  correctionClosesAfter?: IsoDate;
}

/**
 * Whether a participant may write their own record for `entryDate`.
 *
 * BCJ's rule, which replaces the rolling correction window assumed under O-4:
 * every day of the challenge stays open to the participant until the challenge
 * itself ends on the last day of week 12. Someone who joins in week 5, or who
 * falls behind, can go back and fill in earlier weeks.
 *
 * The daily cutoff therefore only bites on that final day, where it is the one
 * real deadline. Enforcing it on any earlier day would be theatre: the
 * participant could simply return the next morning and write the same day as a
 * past date.
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

  if (!clock.started) return { allowed: false, reason: "not_started" };
  if (!isScorableDate(row.startDate as IsoDate, row.totalWeeks, entryDate)) {
    return { allowed: false, reason: "outside_competition" };
  }

  const age = daysBetween(entryDate, clock.today);
  if (age < 0) return { allowed: false, reason: "future_date" };

  // Every in-challenge day shuts at the same moment: the end of the last day.
  const closesAfter = clock.lastDay;

  // Once the challenge is over nothing is self-writable; an organiser can
  // still correct a day, and the audit log records it.
  if (clock.finished) {
    return { allowed: false, reason: "challenge_finished", correctionClosesAfter: closesAfter };
  }

  // The final day carries the one deadline that means anything.
  if (clock.today === clock.lastDay && clock.cutoffPassed) {
    return { allowed: false, reason: "cutoff_passed", correctionClosesAfter: closesAfter };
  }

  return { allowed: true, correctionClosesAfter: closesAfter };
}

export function refusalMessage(reason: WriteRefusal, row: Settings): string {
  switch (reason) {
    case "not_started":
      return `The challenge starts on ${row.startDate}. You can fill in your first day then.`;
    case "outside_competition":
      return "That date falls outside the 12-week challenge.";
    case "future_date":
      return "You cannot fill in a day before it happens.";
    case "cutoff_passed":
      return `This is the last day of the challenge and the ${formatTime(row.submissionCutoff)} deadline has passed. Ask a BCJ organiser to record this day.`;
    case "challenge_finished":
      return "The 12 weeks are over, so days can no longer be changed here. Ask a BCJ organiser if something needs correcting.";
  }
}
