/**
 * Scoring — build specification section 4, restating V6 section 5.
 *
 * This module is pure. It reads no database, no environment and no clock.
 * The active challenge set comes from the entry's own date, never from today
 * (section 4.2). That is the rule test vector T9 exists to protect.
 *
 * `lib/scoring-save.ts` wraps this in a transaction and writes the results.
 */

import {
  CHALLENGES,
  DIET_MAX,
  DIET_OCCASIONS,
  MAX_POINTS_PER_CHALLENGE,
  POINTS_PER_DIET_OCCASION,
  type ChallengeConfig,
  type ChallengeRef,
  type DietField,
} from "./challenges";
import { weekNoFor, type IsoDate } from "./dates";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ScoringSettings {
  /** Official start date. Week 1 begins here. */
  startDate: IsoDate;
  /** 12 weeks, 84 days (open item O-2). */
  totalWeeks: number;
  /** Highest week that unlocks a new challenge — 9 (open item O-1). */
  maxActiveWeek: number;
}

/** Raw inputs as stored on `daily_entries`. Null means "not answered". */
export interface EntryInputs {
  waterLitres?: number | null;
  steps?: number | null;
  sleepHours?: number | null;
  c3CookAtHome?: boolean | null;
  c4NoSugary?: boolean | null;
  c5Vegetables?: boolean | null;
  c6NoLateFood?: boolean | null;
  c8Mindfulness?: boolean | null;
  c9ScreenTime?: boolean | null;
  breakfast?: boolean | null;
  midMorning?: boolean | null;
  lunch?: boolean | null;
  eveningSnack?: boolean | null;
  dinner?: boolean | null;
}

export const EMPTY_ENTRY: EntryInputs = {};

export interface ChallengeScore {
  ref: ChallengeRef;
  title: string;
  points: number;
  max: number;
  /** The value that produced the points, for display and for exports. */
  value: number | boolean | null;
  answered: boolean;
}

export interface DietScore {
  field: DietField;
  title: string;
  points: number;
  value: boolean | null;
  answered: boolean;
}

export interface DailyScore {
  weekNo: number;
  /** Number of lifestyle challenges active in this entry's week. */
  activeChallenges: number;
  challenges: ChallengeScore[];
  diet: DietScore[];
  lifestyleEarned: number;
  lifestyleMax: number;
  dietEarned: number;
  dietMax: number;
  dailyPoints: number;
  maxPoints: number;
  /** Rounded to 4 decimal places. Round again only for display. */
  dailyPercentage: number;
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/**
 * Quantitative rule — section 4.3, with open item O-9 resolved as floor.
 *
 *   points = min(floor(value / unit), 10)
 *
 * Scored in integer arithmetic scaled by `precision` so that a value such as
 * 0.249 L cannot be lifted over a threshold by binary floating point.
 */
export function quantitativePoints(
  value: number | null | undefined,
  unit: number,
  precision: number,
): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  if (value <= 0) return 0;
  const scale = 10 ** precision;
  const scaledValue = Math.round(value * scale);
  const scaledUnit = Math.round(unit * scale);
  return Math.min(
    Math.floor(scaledValue / scaledUnit),
    MAX_POINTS_PER_CHALLENGE,
  );
}

/** Yes/No rule — section 4.3. Yes is 10, No is 0, no answer is 0. */
export function yesNoPoints(value: boolean | null | undefined): number {
  return value === true ? MAX_POINTS_PER_CHALLENGE : 0;
}

/** Percentages are stored at 4 decimal places — section 4.6. */
export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

/* ------------------------------------------------------------------ */
/* Active set                                                          */
/* ------------------------------------------------------------------ */

/**
 * Challenges active in a given week — section 4.2.
 *
 *   activeChallenges = C1 through C[min(weekNo, maxActiveWeek)]
 *
 * Cumulative: week 2 adds steps on top of week 1's water target. Weeks 10 to
 * 12 repeat the week 9 set, because C10 is read as a phase label (O-1).
 *
 * `maxActiveWeek` is clamped to the number of configured challenges. If BCJ
 * resolves O-1 by naming a tenth measured challenge, add it to
 * `lib/challenges.ts` and raise `settings.max_active_week` to 10 together.
 */
export function activeChallengesForWeek(
  weekNo: number,
  maxActiveWeek: number,
): ChallengeConfig[] {
  if (weekNo < 1) return [];
  const cap = Math.min(maxActiveWeek, CHALLENGES.length);
  const count = Math.min(weekNo, cap);
  return CHALLENGES.slice(0, count);
}

/* ------------------------------------------------------------------ */
/* Daily score                                                         */
/* ------------------------------------------------------------------ */

function readValue(
  inputs: EntryInputs,
  challenge: ChallengeConfig,
): number | boolean | null {
  const raw = inputs[challenge.field];
  return raw === undefined ? null : raw;
}

/**
 * Scores one day — section 4.5.
 *
 *   dailyPoints     = lifestyleEarned + dietEarned
 *   maxPoints       = activeChallenges * 10 + 10
 *   dailyPercentage = dailyPoints / maxPoints * 100
 *
 * `entryDate` decides the week, and therefore the active set and the maximum.
 * Pass the entry's own date, not today's.
 */
export function scoreEntry(
  settings: ScoringSettings,
  inputs: EntryInputs,
  entryDate: IsoDate,
): DailyScore {
  const weekNo = weekNoFor(settings.startDate, entryDate);
  const active = activeChallengesForWeek(weekNo, settings.maxActiveWeek);

  const challenges: ChallengeScore[] = active.map((challenge) => {
    const value = readValue(inputs, challenge);
    const points =
      challenge.kind === "quantitative"
        ? quantitativePoints(
            value as number | null,
            challenge.unit as number,
            challenge.precision as number,
          )
        : yesNoPoints(value as boolean | null);
    return {
      ref: challenge.ref,
      title: challenge.title,
      points,
      max: MAX_POINTS_PER_CHALLENGE,
      value,
      answered: value !== null,
    };
  });

  // Diet is active every day from week 1 and is part of the ordinary score,
  // not a bonus and not a tie-breaker — section 4.4.
  const diet: DietScore[] = DIET_OCCASIONS.map((occasion) => {
    const raw = inputs[occasion.field];
    const value = raw === undefined ? null : raw;
    return {
      field: occasion.field,
      title: occasion.title,
      points: value === true ? POINTS_PER_DIET_OCCASION : 0,
      value,
      answered: value !== null,
    };
  });

  const lifestyleEarned = challenges.reduce((sum, c) => sum + c.points, 0);
  const lifestyleMax = active.length * MAX_POINTS_PER_CHALLENGE;
  const dietEarned = diet.reduce((sum, d) => sum + d.points, 0);

  const dailyPoints = lifestyleEarned + dietEarned;
  const maxPoints = lifestyleMax + DIET_MAX;
  const dailyPercentage =
    maxPoints === 0 ? 0 : round4((dailyPoints / maxPoints) * 100);

  return {
    weekNo,
    activeChallenges: active.length,
    challenges,
    diet,
    lifestyleEarned,
    lifestyleMax,
    dietEarned,
    dietMax: DIET_MAX,
    dailyPoints,
    maxPoints,
    dailyPercentage,
  };
}

/**
 * A day with no record. Scores 0 against that week's full maximum when
 * `missing_scores_zero` is true (open item O-3, assumed yes).
 */
export function scoreMissingDay(
  settings: ScoringSettings,
  entryDate: IsoDate,
): DailyScore {
  return scoreEntry(settings, EMPTY_ENTRY, entryDate);
}

/** Daily maximum for a week — section 4.7. */
export function dailyMaxForWeek(
  weekNo: number,
  maxActiveWeek: number,
): number {
  return (
    activeChallengesForWeek(weekNo, maxActiveWeek).length *
      MAX_POINTS_PER_CHALLENGE +
    DIET_MAX
  );
}

/* ------------------------------------------------------------------ */
/* Weekly and final                                                    */
/* ------------------------------------------------------------------ */

/**
 * Weekly percentage — section 4.6: the average of that week's seven daily
 * percentages. The divisor is always 7. A day with no record contributes 0
 * when `missingScoresZero` is true, so a participant cannot raise their week
 * by logging fewer days.
 */
export function weeklyPercentage(
  dailyPercentages: number[],
  daysInWeek = 7,
): number {
  const total = dailyPercentages.reduce((sum, p) => sum + p, 0);
  return round4(total / daysInWeek);
}

/** Final score — section 4.6: the sum of the 12 weekly percentages, max 1,200. */
export function finalScore(weeklyPercentages: number[]): number {
  return round4(weeklyPercentages.reduce((sum, p) => sum + p, 0));
}

/** Final score expressed against the 1,200 point maximum. */
export function finalPercentage(score: number, totalWeeks: number): number {
  const max = totalWeeks * 100;
  return round4((score / max) * 100);
}

/* ------------------------------------------------------------------ */
/* Score bands — specification section 9.1                             */
/* ------------------------------------------------------------------ */

export type ScoreBand = "low" | "mid" | "good" | "high";

export function scoreBand(percentage: number): ScoreBand {
  if (percentage >= 85) return "high";
  if (percentage >= 70) return "good";
  if (percentage >= 50) return "mid";
  return "low";
}
