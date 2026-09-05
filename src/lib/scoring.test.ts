/**
 * Test vectors — build specification section 4.8.
 *
 * These are written before any screen exists. T2 and T3 come from the worked
 * examples in V5 section 9. T9 protects the rule in section 4.2: the active
 * challenge set is derived from the entry's own date, never from today.
 */

import { describe, expect, it } from "vitest";

import {
  activeChallengesForWeek,
  dailyMaxForWeek,
  finalPercentage,
  finalScore,
  quantitativePoints,
  round4,
  scoreBand,
  scoreEntry,
  scoreMissingDay,
  weeklyPercentage,
  type EntryInputs,
  type ScoringSettings,
} from "./scoring";
import { addDays, isScorableDate, weekNoFor } from "./dates";

const SETTINGS: ScoringSettings = {
  startDate: "2026-09-07",
  totalWeeks: 12,
  maxActiveWeek: 9,
};

/** First day of a given competition week, so vectors read by week number. */
function dayInWeek(weekNo: number, dayOffset = 0) {
  return addDays(SETTINGS.startDate, (weekNo - 1) * 7 + dayOffset);
}

/**
 * BCJ replaced the five diet occasions with two main meals on 4 September
 * 2026 — lunch and dinner, five points each. The diet total is still 10, so
 * the vectors below that answer every occasion the same way (T1, T5, T7, T8)
 * are unaffected and keep the totals printed in specification section 4.8.
 *
 * The partial ones are not: "diet 4 of 5" no longer exists as a state. Those
 * vectors are recomputed here under the new rule and their original section
 * 4.8 totals are recorded on each one, so the change stays auditable against
 * BCJ's document.
 */
const ALL_DIET: EntryInputs = { lunch: true, dinner: true };

/** One of the two meals: 5 of 10, the closest analogue to the old 4 of 5. */
const HALF_DIET: EntryInputs = { lunch: true, dinner: false };

describe("section 4.8 test vectors", () => {
  it("T1 — week 1, water 2.0 L, diet 5/5 → 18 / 20, 90.0000%", () => {
    const s = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, ...ALL_DIET },
      dayInWeek(1),
    );
    expect(s.weekNo).toBe(1);
    expect(s.activeChallenges).toBe(1);
    expect(s.dailyPoints).toBe(18);
    expect(s.maxPoints).toBe(20);
    expect(s.dailyPercentage).toBe(90.0);
  });

  // Section 4.8 prints 23 / 30 (76.6667%) for diet 4 of 5. Under the two-meal
  // rule the same day scores diet 5 rather than 8: 8 + 7 + 5 = 20.
  it("T2 — week 2, water 2.0 L, steps 7,400, diet 1/2 → 20 / 30, 66.6667%", () => {
    const s = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, steps: 7400, ...HALF_DIET },
      dayInWeek(2),
    );
    expect(s.activeChallenges).toBe(2);
    expect(s.dietEarned).toBe(5);
    expect(s.dailyPoints).toBe(20);
    expect(s.maxPoints).toBe(30);
    expect(s.dailyPercentage).toBe(66.6667);
  });

  // Section 4.8 prints 36 / 40 (90.0000%) for diet 4 of 5. Under the two-meal
  // rule: 10 + 8 + 10 lifestyle, diet 5 → 33.
  it("T3 — week 3, water 3.0 L, steps 8,200, C3 Yes, diet 1/2 → 33 / 40, 82.5000%", () => {
    const s = scoreEntry(
      SETTINGS,
      {
        waterLitres: 3.0,
        steps: 8200,
        c3CookAtHome: true,
        ...HALF_DIET,
      },
      dayInWeek(3),
    );
    expect(s.activeChallenges).toBe(3);
    expect(s.dailyPoints).toBe(33);
    expect(s.maxPoints).toBe(40);
    expect(s.dailyPercentage).toBe(82.5);
  });

  it("T4 — week 7 mixed inputs → 67 / 80, 83.7500%", () => {
    const s = scoreEntry(
      SETTINGS,
      {
        waterLitres: 2.5,
        steps: 10500,
        c3CookAtHome: true,
        c4NoSugary: true,
        c5Vegetables: true,
        c6NoLateFood: false,
        sleepHours: 7.5,
        ...ALL_DIET,
      },
      dayInWeek(7),
    );
    expect(s.activeChallenges).toBe(7);
    expect(s.dailyPoints).toBe(67);
    expect(s.maxPoints).toBe(80);
    expect(s.dailyPercentage).toBe(83.75);
  });

  it("T5 — week 10, all nine at full marks, diet 5/5 → 100 / 100, 100.0000%", () => {
    const s = scoreEntry(
      SETTINGS,
      {
        waterLitres: 2.5,
        steps: 10000,
        c3CookAtHome: true,
        c4NoSugary: true,
        c5Vegetables: true,
        c6NoLateFood: true,
        sleepHours: 10,
        c8Mindfulness: true,
        c9ScreenTime: true,
        ...ALL_DIET,
      },
      dayInWeek(10),
    );
    expect(s.weekNo).toBe(10);
    expect(s.activeChallenges).toBe(9); // C10 is a phase label, O-1
    expect(s.dailyPoints).toBe(100);
    expect(s.maxPoints).toBe(100);
    expect(s.dailyPercentage).toBe(100.0);
  });

  it("T6 — week 4, no record, deadline passed → 0 / 50, 0.0000%", () => {
    const s = scoreMissingDay(SETTINGS, dayInWeek(4));
    expect(s.activeChallenges).toBe(4);
    expect(s.dailyPoints).toBe(0);
    expect(s.maxPoints).toBe(50);
    expect(s.dailyPercentage).toBe(0.0);
  });

  it("T7 — week 1, water 0.249 L, diet 0/5 → 0 / 20, 0.0000%", () => {
    const s = scoreEntry(
      SETTINGS,
      {
        waterLitres: 0.249,
        breakfast: false,
        midMorning: false,
        lunch: false,
        eveningSnack: false,
        dinner: false,
      },
      dayInWeek(1),
    );
    expect(s.dailyPoints).toBe(0);
    expect(s.maxPoints).toBe(20);
    expect(s.dailyPercentage).toBe(0.0);
  });

  it("T8 — week 2, water 2.0 L, steps 999, diet 5/5 → 18 / 30, 60.0000%", () => {
    const s = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, steps: 999, ...ALL_DIET },
      dayInWeek(2),
    );
    expect(s.dailyPoints).toBe(18);
    expect(s.maxPoints).toBe(30);
    expect(s.dailyPercentage).toBe(60.0);
  });

  // Section 4.8 prints 23 / 30; the two-meal rule makes the same day 20 / 30.
  // What this vector is really guarding is the week, not the total.
  it("T9 — a week 2 record scored while the competition is in week 7 → 20 / 30, 66.6667%", () => {
    // The function is given only the entry's own date. If it read the clock
    // instead, this would return 20 / 80 and the participant would be scored
    // against seven challenges they had not yet been given.
    const entryDate = dayInWeek(2, 3);
    const s = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, steps: 7400, ...HALF_DIET },
      entryDate,
    );
    expect(s.weekNo).toBe(2);
    expect(s.activeChallenges).toBe(2);
    expect(s.dailyPoints).toBe(20);
    expect(s.maxPoints).toBe(30);
    expect(s.dailyPercentage).toBe(66.6667);

    // Scoring the same inputs again yields the same result, whatever the date
    // of the correction. The result is a function of (settings, inputs, date).
    const again = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, steps: 7400, ...HALF_DIET },
      entryDate,
    );
    expect(again).toEqual(s);
  });
});

describe("section 4.2 — cumulative active set", () => {
  it("adds one challenge per week to week 9 and then holds", () => {
    const counts = Array.from({ length: 12 }, (_, i) =>
      activeChallengesForWeek(i + 1, SETTINGS.maxActiveWeek).length,
    );
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9]);
  });

  it("keeps earlier challenges active rather than replacing them", () => {
    const week5 = activeChallengesForWeek(5, 9).map((c) => c.ref);
    expect(week5).toEqual(["C1", "C2", "C3", "C4", "C5"]);
  });

  it("matches the daily maxima table in section 4.7", () => {
    const maxima = Array.from({ length: 12 }, (_, i) =>
      dailyMaxForWeek(i + 1, SETTINGS.maxActiveWeek),
    );
    expect(maxima).toEqual([20, 30, 40, 50, 60, 70, 80, 90, 100, 100, 100, 100]);
  });
});

describe("section 4.3 — points per challenge", () => {
  it("floors quantitative values rather than rounding (O-9)", () => {
    expect(quantitativePoints(2.4, 0.25, 3)).toBe(9); // 9.6 floors to 9
    expect(quantitativePoints(0.249, 0.25, 3)).toBe(0);
    expect(quantitativePoints(0.25, 0.25, 3)).toBe(1);
    expect(quantitativePoints(7999, 1000, 0)).toBe(7);
    expect(quantitativePoints(7.9, 1, 2)).toBe(7);
  });

  it("caps every challenge at 10 points", () => {
    expect(quantitativePoints(9.5, 0.25, 3)).toBe(10);
    expect(quantitativePoints(42000, 1000, 0)).toBe(10);
    expect(quantitativePoints(14, 1, 2)).toBe(10);
  });

  it("scores a missing or negative value as 0", () => {
    expect(quantitativePoints(null, 0.25, 3)).toBe(0);
    expect(quantitativePoints(undefined, 0.25, 3)).toBe(0);
    expect(quantitativePoints(0, 0.25, 3)).toBe(0);
  });

  it("scores an unanswered Yes/No the same as No, and marks it unanswered", () => {
    const explicitNo = scoreEntry(
      SETTINGS,
      { waterLitres: 1, c3CookAtHome: false },
      dayInWeek(3),
    );
    const untouched = scoreEntry(SETTINGS, { waterLitres: 1 }, dayInWeek(3));
    expect(explicitNo.dailyPoints).toBe(untouched.dailyPoints);
    expect(explicitNo.challenges[2].answered).toBe(true);
    expect(untouched.challenges[2].answered).toBe(false);
  });
});

describe("section 4.4 — diet", () => {
  it("is active from week 1 and worth 5 points per meal", () => {
    const s = scoreEntry(SETTINGS, { lunch: true }, dayInWeek(1));
    expect(s.dietEarned).toBe(5);
    expect(s.dietMax).toBe(10);
  });

  it("scores only lunch and dinner", () => {
    // The three retired occasions are still columns on daily_entries, so an
    // old row can still carry them. They must not add points.
    const s = scoreEntry(
      SETTINGS,
      { breakfast: true, midMorning: true, eveningSnack: true },
      dayInWeek(1),
    );
    expect(s.dietEarned).toBe(0);
    expect(s.diet).toHaveLength(2);
    expect(s.diet.map((d) => d.title)).toEqual(["Lunch", "Dinner"]);
  });

  it("both meals reach the same diet total the five occasions did", () => {
    const s = scoreEntry(SETTINGS, { lunch: true, dinner: true }, dayInWeek(1));
    expect(s.dietEarned).toBe(10);
    expect(s.dietMax).toBe(10);
  });

  it("counts inside the ordinary score, not as a bonus", () => {
    const s = scoreEntry(SETTINGS, { waterLitres: 2.5, ...ALL_DIET }, dayInWeek(1));
    expect(s.dailyPoints).toBe(20);
    expect(s.maxPoints).toBe(20);
  });
});

describe("section 4.6 — weekly and final", () => {
  it("averages seven daily percentages", () => {
    expect(weeklyPercentage([90, 90, 90, 90, 90, 90, 90])).toBe(90);
    expect(weeklyPercentage([100, 0, 0, 0, 0, 0, 0])).toBe(14.2857);
  });

  it("divides by seven even when days are missing, so skipping cannot help", () => {
    expect(weeklyPercentage([100, 100, 100, 0, 0, 0, 0])).toBe(42.8571);
  });

  it("sums twelve weekly percentages to a maximum of 1,200", () => {
    expect(finalScore(Array(12).fill(100))).toBe(1200);
    expect(finalPercentage(1200, 12)).toBe(100);
    expect(finalPercentage(600, 12)).toBe(50);
  });

  it("stores at 4 decimal places and rounds only for display", () => {
    expect(round4(76.66666666)).toBe(76.6667);
    expect(round4(1 / 3)).toBe(0.3333);
  });

  it("does not round at each step", () => {
    // Seven days of 23/30. Rounding each day to 2 dp would give 76.67 and a
    // weekly figure of 76.6700; carrying 4 dp gives 76.6667.
    const week = Array(7).fill(round4((23 / 30) * 100));
    expect(weeklyPercentage(week)).toBe(76.6667);
  });
});

describe("competition window", () => {
  it("rejects a date before the start date", () => {
    expect(isScorableDate(SETTINGS.startDate, 12, addDays(SETTINGS.startDate, -1))).toBe(
      false,
    );
    expect(isScorableDate(SETTINGS.startDate, 12, SETTINGS.startDate)).toBe(true);
  });

  it("accepts exactly 84 days and rejects day 85 (O-2)", () => {
    expect(isScorableDate(SETTINGS.startDate, 12, addDays(SETTINGS.startDate, 83))).toBe(
      true,
    );
    expect(isScorableDate(SETTINGS.startDate, 12, addDays(SETTINGS.startDate, 84))).toBe(
      false,
    );
  });

  it("derives the week from the two dates alone", () => {
    expect(weekNoFor("2026-09-07", "2026-09-07")).toBe(1);
    expect(weekNoFor("2026-09-07", "2026-09-13")).toBe(1);
    expect(weekNoFor("2026-09-07", "2026-09-14")).toBe(2);
    expect(weekNoFor("2026-09-07", "2026-11-29")).toBe(12);
  });
});

describe("section 9.1 — score bands", () => {
  it("maps a percentage to its band", () => {
    expect(scoreBand(0)).toBe("low");
    expect(scoreBand(49.9999)).toBe("low");
    expect(scoreBand(50)).toBe("mid");
    expect(scoreBand(69.9999)).toBe("mid");
    expect(scoreBand(70)).toBe("good");
    expect(scoreBand(84.9999)).toBe("good");
    expect(scoreBand(85)).toBe("high");
    expect(scoreBand(100)).toBe("high");
  });
});
