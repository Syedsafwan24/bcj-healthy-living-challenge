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
import { CHALLENGES } from "./challenges";

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
 * BCJ removed the separate diet score on 5 September 2026. A day is now
 * worth its lifestyle challenges alone, so every section 4.8 vector below
 * loses the 10-point diet component from both its total and its maximum.
 * Each one records the figure the specification printed, so the departure
 * stays auditable against BCJ's document.
 *
 * The meal columns still exist and old rows still carry answers, so the
 * vectors keep setting them — they must contribute nothing.
 */
const MEALS_ANSWERED: EntryInputs = { lunch: true, dinner: true };

describe("section 4.8 test vectors", () => {
  it("T1 — week 1, water 2.0 L → 8 / 10, 80.0000% (4.8 prints 18 / 20)", () => {
    const s = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, ...MEALS_ANSWERED },
      dayInWeek(1),
    );
    expect(s.weekNo).toBe(1);
    expect(s.activeChallenges).toBe(1);
    expect(s.dailyPoints).toBe(8);
    expect(s.maxPoints).toBe(10);
    expect(s.dailyPercentage).toBe(80.0);
  });

  // Section 4.8 prints 23 / 30 (76.6667%) for diet 4 of 5 and whole-point
  // steps. Two rule changes since: diet is 5 not 8, and steps award a
  // fraction, so 7,400 is 7.4 not 7. 8 + 7.4 + 5 = 20.4.
  it("T2 — week 2, water 2.0 L, steps 7,400 → 15.4 / 20, 77.0000% (4.8 prints 23 / 30)", () => {
    const s = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, steps: 7400, ...MEALS_ANSWERED },
      dayInWeek(2),
    );
    expect(s.activeChallenges).toBe(2);
    expect(s.challenges[1].points).toBe(7.4);
    expect(s.dailyPoints).toBe(15.4);
    expect(s.maxPoints).toBe(20);
    expect(s.dailyPercentage).toBe(77.0);
  });

  // Section 4.8 prints 36 / 40 (90.0000%). Now: water 10, steps 8.2 (not 8),
  // C3 10, diet 5 → 33.2.
  it("T3 — week 3, water 3.0 L, steps 8,200, C3 Yes → 28.2 / 30, 94.0000% (4.8 prints 36 / 40)", () => {
    const s = scoreEntry(
      SETTINGS,
      {
        waterLitres: 3.0,
        steps: 8200,
        c3CookAtHome: true,
        ...MEALS_ANSWERED,
      },
      dayInWeek(3),
    );
    expect(s.activeChallenges).toBe(3);
    expect(s.dailyPoints).toBe(28.2);
    expect(s.maxPoints).toBe(30);
    expect(s.dailyPercentage).toBe(94.0);
  });

  it("T4 — week 7 mixed inputs → 57 / 70, 81.4286% (4.8 prints 67 / 80)", () => {
    const s = scoreEntry(
      SETTINGS,
      {
        waterLitres: 2.5,
        steps: 10500,
        c3CookAtHome: true,
        c4NoSugary: true,
        // C5 is answered per meal now; "achieved" means both halves, which
        // keeps this vector at the 10 points section 4.8 gave it.
        c5Vegetables: true,
        c5VegetablesDinner: true,
        c6NoLateFood: false,
        sleepHours: 7.5,
        ...MEALS_ANSWERED,
      },
      dayInWeek(7),
    );
    expect(s.activeChallenges).toBe(7);
    expect(s.dailyPoints).toBe(57);
    expect(s.maxPoints).toBe(70);
    expect(s.dailyPercentage).toBe(81.4286);
  });

  it("T5 — week 10, all nine at full marks → 90 / 90, 100.0000% (4.8 prints 100 / 100)", () => {
    const s = scoreEntry(
      SETTINGS,
      {
        waterLitres: 2.5,
        steps: 10000,
        c3CookAtHome: true,
        c4NoSugary: true,
        c5Vegetables: true,
        c5VegetablesDinner: true,
        c6NoLateFood: true,
        sleepHours: 10,
        c8Mindfulness: true,
        c9ScreenTime: true,
        ...MEALS_ANSWERED,
      },
      dayInWeek(10),
    );
    expect(s.weekNo).toBe(10);
    expect(s.activeChallenges).toBe(9); // C10 is a phase label, O-1
    expect(s.dailyPoints).toBe(90);
    expect(s.maxPoints).toBe(90);
    expect(s.dailyPercentage).toBe(100.0);
  });

  it("T6 — week 4, no record, deadline passed → 0 / 40, 0.0000% (4.8 prints 0 / 50)", () => {
    const s = scoreMissingDay(SETTINGS, dayInWeek(4));
    expect(s.activeChallenges).toBe(4);
    expect(s.dailyPoints).toBe(0);
    expect(s.maxPoints).toBe(40);
    expect(s.dailyPercentage).toBe(0.0);
  });

  it("T7 — week 1, water 0.249 L → 0 / 10, 0.0000% (4.8 prints 0 / 20)", () => {
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
    expect(s.maxPoints).toBe(10);
    expect(s.dailyPercentage).toBe(0.0);
  });

  // Section 4.8 prints 18 / 30: 999 steps fell short of the first whole point
  // and scored 0. Steps now award a fraction, so 999 earns 0.99 — truncated,
  // not rounded, so it never reads as the full point it did not reach.
  it("T8 — week 2, water 2.0 L, steps 999 → 8.99 / 20, 44.9500% (4.8 prints 18 / 30)", () => {
    const s = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, steps: 999, ...MEALS_ANSWERED },
      dayInWeek(2),
    );
    expect(s.challenges[1].points).toBe(0.99);
    expect(s.dailyPoints).toBe(8.99);
    expect(s.maxPoints).toBe(20);
    expect(s.dailyPercentage).toBe(44.95);
  });

  // Section 4.8 prints 23 / 30; the two-meal diet and fractional steps make
  // the same day 20.4 / 30. What this vector guards is the week, not the total.
  it("T9 — a week 2 record scored while the competition is in week 7 → 15.4 / 20", () => {
    // The function is given only the entry's own date. If it read the clock
    // instead, this would return 20.4 / 80 and the participant would be scored
    // against seven challenges they had not yet been given.
    const entryDate = dayInWeek(2, 3);
    const s = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, steps: 7400, ...MEALS_ANSWERED },
      entryDate,
    );
    expect(s.weekNo).toBe(2);
    expect(s.activeChallenges).toBe(2);
    expect(s.dailyPoints).toBe(15.4);
    expect(s.maxPoints).toBe(20);
    expect(s.dailyPercentage).toBe(77.0);

    // Scoring the same inputs again yields the same result, whatever the date
    // of the correction. The result is a function of (settings, inputs, date).
    const again = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, steps: 7400, ...MEALS_ANSWERED },
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
    // Section 4.7 prints these 10 higher throughout: each included the diet
    // score BCJ has since removed.
    expect(maxima).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 90, 90, 90]);
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

  // BCJ asked for partial credit on steps alone (5 September 2026).
  it("awards a fraction of a point when partial credit is on", () => {
    expect(quantitativePoints(6900, 1000, 0, true)).toBe(6.9);
    expect(quantitativePoints(8200, 1000, 0, true)).toBe(8.2);
    expect(quantitativePoints(500, 1000, 0, true)).toBe(0.5);
    expect(quantitativePoints(10, 1000, 0, true)).toBe(0.01);
  });

  it("truncates partial credit rather than rounding it up", () => {
    // 6,999 steps is 6.999 of a point. Rounding would show 7, claiming a
    // whole point the participant did not reach — the same reasoning as the
    // floor rule above.
    expect(quantitativePoints(6999, 1000, 0, true)).toBe(6.99);
    expect(quantitativePoints(9995, 1000, 0, true)).toBe(9.99);
    expect(quantitativePoints(5, 1000, 0, true)).toBe(0);
  });

  it("still caps partial credit at 10 points", () => {
    expect(quantitativePoints(42000, 1000, 0, true)).toBe(10);
    expect(quantitativePoints(10000, 1000, 0, true)).toBe(10);
  });

  it("leaves water and sleep on whole points", () => {
    // Only C2 carries partialCredit, so the other two are unchanged.
    const steps = CHALLENGES.find((c) => c.ref === "C2");
    const water = CHALLENGES.find((c) => c.ref === "C1");
    const sleep = CHALLENGES.find((c) => c.ref === "C7");
    expect(steps?.partialCredit).toBe(true);
    expect(water?.partialCredit).toBeUndefined();
    expect(sleep?.partialCredit).toBeUndefined();
  });

  it("a day's total carries the fraction without float dust", () => {
    const s = scoreEntry(
      SETTINGS,
      { waterLitres: 2.0, steps: 6900, ...MEALS_ANSWERED },
      dayInWeek(2),
    );
    // 8 water + 6.9 steps, not 14.900000000000002.
    expect(s.dailyPoints).toBe(14.9);
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

describe("C5 — vegetables, answered per meal", () => {
  // BCJ split C5 across the two main meals on 5 September 2026: lunch and
  // dinner are answered separately and score half each.
  const week5 = () => dayInWeek(5);

  function c5(inputs: EntryInputs) {
    return scoreEntry(SETTINGS, inputs, week5()).challenges.find(
      (c) => c.ref === "C5",
    )!;
  }

  it("scores 5 for lunch alone", () => {
    expect(c5({ c5Vegetables: true }).points).toBe(5);
  });

  it("scores 5 for dinner alone", () => {
    expect(c5({ c5VegetablesDinner: true }).points).toBe(5);
  });

  it("scores the full 10 for both", () => {
    expect(c5({ c5Vegetables: true, c5VegetablesDinner: true }).points).toBe(10);
  });

  it("scores 0 for neither, and counts as answered", () => {
    // "None" is a real answer worth nothing, which is not the same as never
    // having answered — the screen shows the two differently.
    const none = c5({ c5Vegetables: false, c5VegetablesDinner: false });
    expect(none.points).toBe(0);
    expect(none.answered).toBe(true);
  });

  it("is unanswered until one half is touched", () => {
    expect(c5({}).answered).toBe(false);
    expect(c5({ c5VegetablesDinner: false }).answered).toBe(true);
  });

  it("still tops out at the same 10 points the single question was worth", () => {
    const s = scoreEntry(
      SETTINGS,
      { c5Vegetables: true, c5VegetablesDinner: true },
      week5(),
    );
    expect(s.challenges.find((c) => c.ref === "C5")!.max).toBe(10);
    expect(s.maxPoints).toBe(50);
  });
});

describe("the retired diet score", () => {
  // BCJ removed the separate diet component on 5 September 2026. The five
  // meal columns survive so nobody's recorded answers are destroyed, but a
  // day's score must no longer include them.
  it("adds nothing, whatever the meal columns say", () => {
    const empty = scoreEntry(SETTINGS, {}, dayInWeek(1));
    const answered = scoreEntry(
      SETTINGS,
      {
        breakfast: true,
        midMorning: true,
        lunch: true,
        eveningSnack: true,
        dinner: true,
      },
      dayInWeek(1),
    );
    expect(answered.dailyPoints).toBe(empty.dailyPoints);
    expect(answered.maxPoints).toBe(empty.maxPoints);
  });

  it("leaves a week 1 day worth its single challenge", () => {
    const s = scoreEntry(SETTINGS, { waterLitres: 2.5 }, dayInWeek(1));
    expect(s.dailyPoints).toBe(10);
    expect(s.maxPoints).toBe(10);
    expect(s.dailyPercentage).toBe(100);
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
