// diet.ts also exports listDietCategories, which imports the db client at
// module scope. suggestDietCategory itself never touches the database, but
// the module can't load without DATABASE_URL set, so this pulls in the same
// env loader the db-backed test suites use.
import "@/db/load-env";
import { describe, expect, it } from "vitest";

import { KIDS_MAX_AGE, KIDS_MIN_AGE, suggestDietCategory } from "./diet";
import type { DietCategory } from "@/db/schema";

/**
 * suggestDietCategory used to assume age and weight were always given, since
 * the registration form used to require both. BCJ dropped that requirement,
 * so this now has to make a sensible suggestion — or flag for review rather
 * than guess — for every combination of present and missing.
 */

function category(over: Partial<DietCategory>): DietCategory {
  return {
    id: 1,
    code: "kg_50_60",
    title: "50 to 60 kg",
    minAge: null,
    maxAge: null,
    minWeight: "50",
    maxWeight: "60",
    plan: null,
    sortOrder: 1,
    ...over,
  };
}

const KIDS = category({
  id: 0,
  code: "kids_10_17",
  title: "Kids",
  minWeight: null,
  maxWeight: null,
  sortOrder: 0,
});
const BAND_50_60 = category({ id: 1, code: "kg_50_60", title: "50 to 60 kg", minWeight: "50", maxWeight: "60", sortOrder: 1 });
const BAND_60_75 = category({ id: 2, code: "kg_60_75", title: "60 to 75 kg", minWeight: "60", maxWeight: "75", sortOrder: 2 });
const CATEGORIES = [KIDS, BAND_50_60, BAND_60_75];

describe("suggestDietCategory", () => {
  it("still matches the kids band when age is given", () => {
    const result = suggestDietCategory(CATEGORIES, KIDS_MIN_AGE, 40);
    expect(result).toMatchObject({ code: "kids_10_17", needsReview: false });
  });

  it("still matches an adult weight band when both are given", () => {
    const result = suggestDietCategory(CATEGORIES, 30, 65);
    expect(result).toMatchObject({ code: "kg_60_75", needsReview: false });
  });

  it("age just past the kids band falls through to weight matching", () => {
    const result = suggestDietCategory(CATEGORIES, KIDS_MAX_AGE + 1, 65);
    expect(result).toMatchObject({ code: "kg_60_75", needsReview: false });
  });

  it("flags for review with no suggestion when weight is missing", () => {
    const result = suggestDietCategory(CATEGORIES, 30, null);
    expect(result).toMatchObject({ categoryId: null, code: null, needsReview: true });
    expect(result.note).toMatch(/no weight/i);
  });

  it("flags for review even though age is missing, when weight is also missing", () => {
    const result = suggestDietCategory(CATEGORIES, null, null);
    expect(result).toMatchObject({ categoryId: null, needsReview: true });
  });

  it("matches a weight band when age is missing, but still flags for review", () => {
    // A weight band alone cannot rule out the kids band, since a 12-year-old
    // could plausibly weigh 65 kg — an organiser has to decide, not the code.
    const result = suggestDietCategory(CATEGORIES, null, 65);
    expect(result).toMatchObject({ code: "kg_60_75", needsReview: true });
    expect(result.note).toMatch(/no age/i);
  });

  it("does not apply the kids band when age is missing, even for a plausible kids weight", () => {
    const result = suggestDietCategory(CATEGORIES, null, 65);
    expect(result.code).not.toBe("kids_10_17");
  });
});
