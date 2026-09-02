import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  dailyEntries,
  finalScores,
  participants,
  weeklyScores,
  type EntryStatus,
  type Settings,
} from "@/db/schema";
import { datesInWeek, weekNoFor, type IsoDate } from "@/lib/dates";
import {
  finalPercentage,
  finalScore as sumWeeks,
  round4,
  scoreEntry,
  weeklyPercentage,
  type EntryInputs,
} from "@/lib/scoring";
import { toScoringSettings } from "@/lib/settings";

/**
 * Persisting scores — build specification section 8.1.
 *
 * `lib/scoring.ts` is pure. This module wraps it in a transaction: it writes
 * the three calculated columns on `daily_entries`, recomputes that week's
 * `weekly_scores` row, and recomputes `final_scores`. All three succeed or
 * none do.
 *
 * No function here accepts a point value or a percentage from a caller. The
 * client sends raw inputs only (V6 section 8).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Raw inputs as they arrive from a form. Nothing calculated. */
export interface EntryWrite extends EntryInputs {
  participantId: string;
  entryDate: IsoDate;
  status?: EntryStatus;
}

export interface SavedEntry {
  entryId: string;
  weekNo: number;
  dailyPoints: number;
  maxPoints: number;
  dailyPercentage: number;
  weekPercentage: number;
  finalScore: number;
  finalPercentage: number;
}

function toNumeric(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function fromNumeric(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/* ------------------------------------------------------------------ */
/* Writing one day                                                     */
/* ------------------------------------------------------------------ */

/**
 * Scores and stores one day, then rolls the change up through the week and
 * the final score.
 *
 * The week is derived from `entryDate`, never from today, so a correction
 * made in week 7 to a week 2 record is still scored against week 2's two
 * active challenges (section 4.2, test vector T9).
 */
export async function saveEntry(
  row: Settings,
  write: EntryWrite,
): Promise<SavedEntry> {
  const scoringSettings = toScoringSettings(row);
  const score = scoreEntry(scoringSettings, write, write.entryDate);
  const status: EntryStatus = write.status ?? "submitted";
  const now = new Date();

  return db.transaction(async (tx) => {
    // Duplicate submissions are prevented by the UNIQUE constraint on
    // (participant_id, entry_date) plus ON CONFLICT DO UPDATE — section 11.
    const [entry] = await tx
      .insert(dailyEntries)
      .values({
        participantId: write.participantId,
        entryDate: write.entryDate,
        weekNo: score.weekNo,
        waterLitres: toNumeric(write.waterLitres),
        steps: write.steps ?? null,
        sleepHours: toNumeric(write.sleepHours),
        c3CookAtHome: write.c3CookAtHome ?? null,
        c4NoSugary: write.c4NoSugary ?? null,
        c5Vegetables: write.c5Vegetables ?? null,
        c6NoLateFood: write.c6NoLateFood ?? null,
        c8Mindfulness: write.c8Mindfulness ?? null,
        c9ScreenTime: write.c9ScreenTime ?? null,
        breakfast: write.breakfast ?? null,
        midMorning: write.midMorning ?? null,
        lunch: write.lunch ?? null,
        eveningSnack: write.eveningSnack ?? null,
        dinner: write.dinner ?? null,
        dailyPoints: score.dailyPoints,
        maxPoints: score.maxPoints,
        dailyPercentage: String(score.dailyPercentage),
        status,
        submittedAt: status === "missing" ? null : now,
        computedAt: now,
      })
      .onConflictDoUpdate({
        target: [dailyEntries.participantId, dailyEntries.entryDate],
        set: {
          weekNo: score.weekNo,
          waterLitres: toNumeric(write.waterLitres),
          steps: write.steps ?? null,
          sleepHours: toNumeric(write.sleepHours),
          c3CookAtHome: write.c3CookAtHome ?? null,
          c4NoSugary: write.c4NoSugary ?? null,
          c5Vegetables: write.c5Vegetables ?? null,
          c6NoLateFood: write.c6NoLateFood ?? null,
          c8Mindfulness: write.c8Mindfulness ?? null,
          c9ScreenTime: write.c9ScreenTime ?? null,
          breakfast: write.breakfast ?? null,
          midMorning: write.midMorning ?? null,
          lunch: write.lunch ?? null,
          eveningSnack: write.eveningSnack ?? null,
          dinner: write.dinner ?? null,
          dailyPoints: score.dailyPoints,
          maxPoints: score.maxPoints,
          dailyPercentage: String(score.dailyPercentage),
          status,
          submittedAt: status === "missing" ? null : now,
          computedAt: now,
        },
      })
      .returning({ id: dailyEntries.id });

    const weekPercentage = await recomputeWeek(
      tx,
      row,
      write.participantId,
      score.weekNo,
    );
    const totals = await recomputeFinal(tx, row, write.participantId);

    return {
      entryId: entry.id,
      weekNo: score.weekNo,
      dailyPoints: score.dailyPoints,
      maxPoints: score.maxPoints,
      dailyPercentage: score.dailyPercentage,
      weekPercentage,
      finalScore: totals.finalScore,
      finalPercentage: totals.finalPercentage,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Rolling up                                                          */
/* ------------------------------------------------------------------ */

/**
 * Weekly percentage — section 4.6: the average of that week's seven daily
 * percentages. The divisor is 7, not the number of records, so a missing day
 * costs the week whether or not a `missing` row exists yet.
 */
export async function recomputeWeek(
  tx: Tx,
  row: Settings,
  participantId: string,
  weekNo: number,
): Promise<number> {
  const dates = datesInWeek(row.startDate as IsoDate, weekNo);

  const rows = await tx
    .select({
      entryDate: dailyEntries.entryDate,
      dailyPercentage: dailyEntries.dailyPercentage,
      status: dailyEntries.status,
    })
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.participantId, participantId),
        inArray(dailyEntries.entryDate, dates),
      ),
    );

  const byDate = new Map(rows.map((r) => [r.entryDate, r]));

  // A day with no record scores 0 when missing_scores_zero is true (O-3).
  // If BCJ ever sets it false, unrecorded days drop out of the average
  // instead of pulling it down.
  const percentages: number[] = [];
  let daysCounted = 0;

  for (const date of dates) {
    const entry = byDate.get(date);
    if (entry && entry.status !== "missing") {
      percentages.push(Number(entry.dailyPercentage ?? 0));
      daysCounted += 1;
    } else if (row.missingScoresZero) {
      percentages.push(0);
    }
  }

  const divisor = row.missingScoresZero ? dates.length : Math.max(daysCounted, 1);
  const percentage =
    percentages.length === 0 ? 0 : weeklyPercentage(percentages, divisor);

  await tx
    .insert(weeklyScores)
    .values({
      participantId,
      weekNo,
      percentage: String(percentage),
      daysCounted,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [weeklyScores.participantId, weeklyScores.weekNo],
      set: {
        percentage: String(percentage),
        daysCounted,
        computedAt: new Date(),
      },
    });

  return percentage;
}

/**
 * Final score — section 4.6: the sum of the 12 weekly percentages, maximum
 * 1,200. Weeks with no stored row contribute 0.
 */
export async function recomputeFinal(
  tx: Tx,
  row: Settings,
  participantId: string,
): Promise<{ finalScore: number; finalPercentage: number }> {
  const rows = await tx
    .select({
      weekNo: weeklyScores.weekNo,
      percentage: weeklyScores.percentage,
    })
    .from(weeklyScores)
    .where(eq(weeklyScores.participantId, participantId));

  const byWeek = new Map(rows.map((r) => [r.weekNo, Number(r.percentage)]));
  const weekly = Array.from({ length: row.totalWeeks }, (_, i) =>
    byWeek.get(i + 1) ?? 0,
  );

  const score = sumWeeks(weekly);
  const percentage = finalPercentage(score, row.totalWeeks);

  await tx
    .insert(finalScores)
    .values({
      participantId,
      finalScore: String(score),
      finalPercentage: String(percentage),
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: finalScores.participantId,
      set: {
        finalScore: String(score),
        finalPercentage: String(percentage),
        computedAt: new Date(),
      },
    });

  return { finalScore: score, finalPercentage: percentage };
}

/* ------------------------------------------------------------------ */
/* Whole-participant recomputation                                     */
/* ------------------------------------------------------------------ */

/**
 * Rescores every stored day for one participant from its raw inputs, then
 * every week and the final score. Used after an admin changes a setting that
 * affects scoring, and available on /admin/participants/[id] as a repair.
 */
export async function recomputeParticipant(
  row: Settings,
  participantId: string,
): Promise<{ finalScore: number; finalPercentage: number; days: number }> {
  const scoringSettings = toScoringSettings(row);

  return db.transaction(async (tx) => {
    const entries = await tx
      .select()
      .from(dailyEntries)
      .where(eq(dailyEntries.participantId, participantId));

    for (const entry of entries) {
      const inputs: EntryInputs = {
        waterLitres: fromNumeric(entry.waterLitres),
        steps: entry.steps,
        sleepHours: fromNumeric(entry.sleepHours),
        c3CookAtHome: entry.c3CookAtHome,
        c4NoSugary: entry.c4NoSugary,
        c5Vegetables: entry.c5Vegetables,
        c6NoLateFood: entry.c6NoLateFood,
        c8Mindfulness: entry.c8Mindfulness,
        c9ScreenTime: entry.c9ScreenTime,
        breakfast: entry.breakfast,
        midMorning: entry.midMorning,
        lunch: entry.lunch,
        eveningSnack: entry.eveningSnack,
        dinner: entry.dinner,
      };
      // The entry's own date decides the week and the maximum.
      const score = scoreEntry(scoringSettings, inputs, entry.entryDate as IsoDate);
      await tx
        .update(dailyEntries)
        .set({
          weekNo: score.weekNo,
          dailyPoints: score.dailyPoints,
          maxPoints: score.maxPoints,
          dailyPercentage: String(score.dailyPercentage),
          computedAt: new Date(),
        })
        .where(eq(dailyEntries.id, entry.id));
    }

    for (let weekNo = 1; weekNo <= row.totalWeeks; weekNo += 1) {
      await recomputeWeek(tx, row, participantId, weekNo);
    }

    const totals = await recomputeFinal(tx, row, participantId);
    return { ...totals, days: entries.length };
  });
}

/** Rescores everyone. Used after a settings change that affects scoring. */
export async function recomputeAll(row: Settings): Promise<number> {
  const all = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.status, "active"));

  for (const participant of all) {
    await recomputeParticipant(row, participant.id);
  }
  return all.length;
}

/** Week for a date under the current settings. Convenience for callers. */
export function weekForDate(row: Settings, entryDate: IsoDate): number {
  return weekNoFor(row.startDate as IsoDate, entryDate);
}

export { round4 };
