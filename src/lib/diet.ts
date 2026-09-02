import "server-only";

import { asc } from "drizzle-orm";

import { db } from "@/db";
import { dietCategories, type DietCategory } from "@/db/schema";

/**
 * Diet categories — V5 section 6, open item O-11.
 *
 * V6 references the approved BCJ diet plan but does not list categories.
 * V5 gives Kids (10 to 17 years), 50–60 kg, 60–75 kg, 75–90 kg, and 90 kg and
 * above. BCJ should confirm these carry forward and define what happens for
 * an adult under 50 kg.
 *
 * Until that is answered, an adult under 50 kg is suggested the lightest
 * adult band and the assignment is flagged for an admin to confirm.
 */

export const KIDS_MIN_AGE = 10;
export const KIDS_MAX_AGE = 17;

export async function listDietCategories(): Promise<DietCategory[]> {
  return db.select().from(dietCategories).orderBy(asc(dietCategories.sortOrder));
}

export interface DietSuggestion {
  categoryId: number | null;
  code: string | null;
  title: string | null;
  /** True when the rules do not cover this participant — open item O-11. */
  needsReview: boolean;
  note?: string;
}

/**
 * Suggests a category at registration. An admin confirms or changes it on
 * /admin/participants, which is where the assignment actually happens.
 */
export function suggestDietCategory(
  categories: DietCategory[],
  age: number,
  weightKg: number,
): DietSuggestion {
  const kids = categories.find((c) => c.code === "kids_10_17");
  if (age >= KIDS_MIN_AGE && age <= KIDS_MAX_AGE && kids) {
    return {
      categoryId: kids.id,
      code: kids.code,
      title: kids.title,
      needsReview: false,
    };
  }

  const adult = categories
    .filter((c) => c.code !== "kids_10_17")
    .sort((a, b) => Number(a.minWeight ?? 0) - Number(b.minWeight ?? 0));

  const match = adult.find((c) => {
    const min = c.minWeight === null ? -Infinity : Number(c.minWeight);
    const max = c.maxWeight === null ? Infinity : Number(c.maxWeight);
    return weightKg >= min && weightKg < max;
  });

  if (match) {
    return {
      categoryId: match.id,
      code: match.code,
      title: match.title,
      needsReview: false,
    };
  }

  // Below the lightest adult band. V5 does not define this case.
  const lightest = adult[0];
  if (lightest && weightKg < Number(lightest.minWeight ?? 0)) {
    return {
      categoryId: lightest.id,
      code: lightest.code,
      title: lightest.title,
      needsReview: true,
      note: `V5 section 6 starts at ${lightest.minWeight} kg and does not define a band below it (open item O-11). Confirm before activating.`,
    };
  }

  return {
    categoryId: null,
    code: null,
    title: null,
    needsReview: true,
    note: "No category matches this age and weight. Assign one before activating.",
  };
}
