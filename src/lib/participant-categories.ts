import {
  participantCategories,
  type ParticipantCategory,
} from "@/db/schema";

/**
 * How a participant's category is written on screen, and the order the prize
 * divisions are listed in.
 *
 * One place, because the label is read on the registration form, the admin
 * editor and roster, both leaderboards, the participant's own details and
 * every export. Six copies of `x === "male" ? "Male" : "Female"` is how a
 * third option ends up rendering as "Female" somewhere nobody looked.
 */

/**
 * The Kids band, 10 to 17, as V5 section 6 defines it for the diet
 * categories. The competition category uses the same boundary so that a
 * participant's prize division and their diet band never disagree.
 *
 * Here rather than in lib/diet.ts because that module is server-only and the
 * registration form needs to tell a registrant which category they are in.
 */
export const KIDS_MIN_AGE = 10;
export const KIDS_MAX_AGE = 17;

export interface CategoryOption {
  value: ParticipantCategory;
  /** On a form, and against one person. */
  label: string;
  /** Heading a division of the leaderboard. */
  groupTitle: string;
  sort: number;
}

export const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  { value: "male", label: "Male", groupTitle: "Male", sort: 0 },
  { value: "female", label: "Female", groupTitle: "Female", sort: 1 },
  { value: "kids", label: "Kids", groupTitle: "Kids", sort: 2 },
] as const;

function find(value: string): CategoryOption | undefined {
  return CATEGORY_OPTIONS.find((option) => option.value === value);
}

/** Falls back to the stored value, so an unknown one is visible, not hidden. */
export function categoryLabel(value: string): string {
  return find(value)?.label ?? value;
}

export function categoryGroupTitle(value: string): string {
  return find(value)?.groupTitle ?? value;
}

/** Unknown categories sort last rather than jumping to the front. */
export function categorySort(value: string): number {
  return find(value)?.sort ?? CATEGORY_OPTIONS.length;
}

export { participantCategories, type ParticipantCategory };
