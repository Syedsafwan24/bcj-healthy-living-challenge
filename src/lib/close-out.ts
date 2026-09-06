import "server-only";

import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";

import { db } from "@/db";
import { dailyEntries, participants, type Settings } from "@/db/schema";
import { addDays, daysBetween, weekNoFor, type IsoDate } from "@/lib/dates";
import {
  recomputeFinal,
  recomputeWeek,
  saveEntry,
} from "@/lib/scoring-save";

/**
 * Closing days off: filling the gaps and making them final.
 *
 * Both the nightly job and the organiser's "close the competition" button do
 * this, and they must do it identically — a day the cron would have scored 0%
 * cannot be scored differently because a button was pressed first. So it lives
 * here once rather than in each caller.
 */

export interface MissingSweep {
  /** Days written as `missing`. */
  marked: number;
  participantsTouched: number;
  weeksRecomputed: number;
}

/**
 * Writes a `missing` row for every active participant's unrecorded day from
 * the start of the challenge up to and including `through`, then rolls the
 * affected weeks and final scores up.
 *
 * Idempotent: a day that already has a row of any status is left alone, so
 * running it twice changes nothing the second time.
 */
export async function sweepMissingDays(
  row: Settings,
  through: IsoDate,
): Promise<MissingSweep> {
  const result: MissingSweep = {
    marked: 0,
    participantsTouched: 0,
    weeksRecomputed: 0,
  };

  const firstDay = row.startDate as IsoDate;
  if (daysBetween(firstDay, through) < 0) return result;

  const dates: IsoDate[] = [];
  for (
    let date = firstDay;
    daysBetween(date, through) >= 0;
    date = addDays(date, 1)
  ) {
    dates.push(date);
  }

  const active = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.status, "active"));

  if (active.length === 0) return result;

  const existing = await db
    .select({
      participantId: dailyEntries.participantId,
      entryDate: dailyEntries.entryDate,
    })
    .from(dailyEntries)
    .where(inArray(dailyEntries.entryDate, dates));

  const have = new Set(
    existing.map((entry) => `${entry.participantId}|${entry.entryDate}`),
  );

  const touched = new Set<string>();
  const weeks = new Set<string>();

  for (const participant of active) {
    for (const date of dates) {
      if (have.has(`${participant.id}|${date}`)) continue;

      // A `missing` row with null inputs. `saveEntry` scores it through the
      // same pure function as any other day, using the entry's own date, so
      // its maximum is that week's maximum and its percentage is 0.
      await saveEntry(row, {
        participantId: participant.id,
        entryDate: date,
        status: "missing",
      });

      result.marked += 1;
      touched.add(participant.id);
      weeks.add(`${participant.id}|${weekNoFor(firstDay, date)}`);
    }
  }

  // saveEntry already rolled each written day up through its week and final
  // score. This pass covers weeks that changed for any other reason, and is
  // what makes the job safe to run twice.
  await db.transaction(async (tx) => {
    for (const key of weeks) {
      const [participantId, weekNo] = key.split("|");
      await recomputeWeek(tx, row, participantId, Number(weekNo));
      result.weeksRecomputed += 1;
    }
    for (const participantId of touched) {
      await recomputeFinal(tx, row, participantId);
    }
  });

  result.participantsTouched = touched.size;
  return result;
}

/**
 * Makes every recorded day up to and including `lastDay` final.
 *
 * Called twice over, for two different reasons: with a four-week block's last
 * day each time a block passes its catch-up deadline, and with the last day of
 * the challenge when an organiser closes the competition. Blocks close in
 * order, so locking through the newest closed block also covers every earlier
 * one — which is what makes it safe to run on a schedule.
 *
 * `missing` rows are left as they are: their status is what marks them as
 * never filled in, and overwriting it would lose that. They are already
 * unwritable, because a closed block refuses every date inside it.
 *
 * Returns how many rows changed, so a second run reports 0.
 */
export async function lockEntriesThrough(lastDay: IsoDate): Promise<number> {
  const locked = await db
    .update(dailyEntries)
    .set({ status: "locked" })
    .where(
      and(
        lt(dailyEntries.entryDate, addDays(lastDay, 1)),
        ne(dailyEntries.status, "locked"),
        ne(dailyEntries.status, "missing"),
      ),
    )
    .returning({ id: dailyEntries.id });

  return locked.length;
}

/**
 * The reverse, for an organiser who closed the competition by mistake.
 *
 * A locked day goes back to `submitted`, which is the only status it can have
 * had: locking is the one thing that writes `locked`, and it only ever touches
 * rows that were submitted.
 *
 * `after` is the last day of the newest block that closed on its own deadline.
 * Days on or before it stay locked, because reopening the competition does not
 * reopen weeks 1–4 — those closed at the end of their catch-up week and that
 * decision was never the organiser's to undo here. Pass null to unlock
 * everything.
 */
export async function unlockEntriesAfter(after: IsoDate | null): Promise<number> {
  const unlocked = await db
    .update(dailyEntries)
    .set({ status: "submitted" })
    .where(
      after === null
        ? eq(dailyEntries.status, "locked")
        : and(
            eq(dailyEntries.status, "locked"),
            gt(dailyEntries.entryDate, after),
          ),
    )
    .returning({ id: dailyEntries.id });

  return unlocked.length;
}
