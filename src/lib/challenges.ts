/**
 * Challenge configuration — build specification Appendix A, from V6 section 2.
 *
 * Challenges are cumulative: one that unlocks in a given week stays active for
 * every remaining week (specification section 4.2).
 *
 * C10 "Repeat all challenges together" is read as a phase label, not a tenth
 * measured challenge (open item O-1). Weeks 10 to 12 therefore activate C1..C9
 * and the daily maximum stays at 100.
 */

export type ChallengeRef =
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "C6"
  | "C7"
  | "C8"
  | "C9";

/**
 * "mealPair" is C5, which BCJ splits across the two main meals: vegetables
 * with lunch and with dinner are answered separately and score half each.
 */
export type ChallengeKind = "quantitative" | "yesno" | "mealPair";

/** Column on `daily_entries` that carries this challenge's raw input. */
export type ChallengeField =
  | "waterLitres"
  | "steps"
  | "sleepHours"
  | "c3CookAtHome"
  | "c4NoSugary"
  | "c5Vegetables"
  | "c5VegetablesDinner"
  | "c6NoLateFood"
  | "c8Mindfulness"
  | "c9ScreenTime";

export interface ChallengeConfig {
  ref: ChallengeRef;
  /** Week in which the challenge unlocks. */
  activatesWeek: number;
  title: string;
  /** Short line shown under the title on the log screen. */
  hint: string;
  kind: ChallengeKind;
  field: ChallengeField;
  /** Metric hue token from specification section 9.1. */
  metric: "water" | "steps" | "sleep" | "mind" | "nutrition";
  icon: "droplet" | "footprints" | "chef-hat" | "cup-soda" | "salad" | "moon-star" | "bed" | "brain" | "smartphone";
  /** mealPair only: the second field, answered alongside `field`. */
  secondField?: ChallengeField;
  /** mealPair only: what each half is called on screen. */
  mealLabels?: { first: string; second: string };
  /** Quantitative only: input value per point. */
  unit?: number;
  /** Quantitative only: decimal places used to score in integer arithmetic. */
  precision?: number;
  /** Quantitative only: unit label and stepper increment. */
  unitLabel?: string;
  step?: number;
  /** Quantitative only: value that reaches the 10-point cap. */
  target?: number;
  /**
   * Quantitative only. When true the challenge awards a fraction of a point
   * rather than rounding down: 6,900 steps earns 6.9, not 6. BCJ asked for
   * this on steps alone (5 September 2026); water and sleep still score in
   * whole points.
   */
  partialCredit?: boolean;
}

export const MAX_POINTS_PER_CHALLENGE = 10;

/** Each half of a mealPair challenge — see ChallengeKind. */
export const POINTS_PER_MEAL_HALF = MAX_POINTS_PER_CHALLENGE / 2;

export const CHALLENGES: readonly ChallengeConfig[] = [
  {
    ref: "C1",
    activatesWeek: 1,
    title: "Drink 2–3 L of water daily",
    hint: "250 ml earns 1 point, up to 10 points.",
    kind: "quantitative",
    field: "waterLitres",
    metric: "water",
    icon: "droplet",
    unit: 0.25,
    precision: 3,
    unitLabel: "L",
    step: 0.25,
    target: 2.5,
  },
  {
    ref: "C2",
    activatesWeek: 2,
    title: "Hit 8,000–10,000 steps daily",
    hint: "1,000 steps earn 1 point, counted to the nearest tenth.",
    partialCredit: true,
    kind: "quantitative",
    field: "steps",
    metric: "steps",
    icon: "footprints",
    unit: 1000,
    precision: 0,
    unitLabel: "steps",
    step: 1000,
    target: 10000,
  },
  {
    ref: "C3",
    activatesWeek: 3,
    title: "Cook all meals at home",
    hint: "Yes earns 10 points. No earns 0.",
    kind: "yesno",
    field: "c3CookAtHome",
    metric: "nutrition",
    icon: "chef-hat",
  },
  {
    ref: "C4",
    activatesWeek: 4,
    title: "No sugary drinks & desserts",
    hint: "Sweet dishes count too. Yes earns 10 points. No earns 0.",
    kind: "yesno",
    field: "c4NoSugary",
    metric: "nutrition",
    icon: "cup-soda",
  },
  {
    ref: "C5",
    activatesWeek: 5,
    title: "Eat vegetables with your main meals",
    hint: "5 points for lunch, 5 for dinner. Neither earns 0.",
    kind: "mealPair",
    field: "c5Vegetables",
    secondField: "c5VegetablesDinner",
    mealLabels: { first: "Lunch", second: "Dinner" },
    metric: "nutrition",
    icon: "salad",
  },
  {
    ref: "C6",
    activatesWeek: 6,
    title: "No eating after 8 PM",
    hint: "Yes earns 10 points. No earns 0.",
    kind: "yesno",
    field: "c6NoLateFood",
    metric: "nutrition",
    icon: "moon-star",
  },
  {
    ref: "C7",
    activatesWeek: 7,
    title: "Sleep at least 7–8 hours per night",
    hint: "1 hour earns 1 point, up to 10 points.",
    kind: "quantitative",
    field: "sleepHours",
    metric: "sleep",
    icon: "bed",
    unit: 1,
    precision: 2,
    unitLabel: "h",
    step: 0.5,
    target: 8,
  },
  {
    ref: "C8",
    activatesWeek: 8,
    title: "10 minutes of mindfulness or breathing",
    hint: "Yes earns 10 points. No earns 0.",
    kind: "yesno",
    field: "c8Mindfulness",
    metric: "mind",
    icon: "brain",
  },
  {
    ref: "C9",
    activatesWeek: 9,
    title: "Limit screen time before bed",
    hint: "Yes earns 10 points. No earns 0.",
    kind: "yesno",
    field: "c9ScreenTime",
    metric: "mind",
    icon: "smartphone",
  },
] as const;

/** Diet occasions — specification section 4.4. See DIET_OCCASIONS below. */
export type DietField =
  | "breakfast"
  | "midMorning"
  | "lunch"
  | "eveningSnack"
  | "dinner";

export interface DietOccasion {
  field: DietField;
  title: string;
}

/**
 * BCJ reduced the diet section to the two main meals on 4 September 2026.
 * It was five occasions worth two points each; it is now two worth five, so
 * the diet total is still 10 and every daily maximum is unchanged.
 *
 * breakfast, mid_morning and evening_snack remain as nullable columns on
 * daily_entries so existing answers are not destroyed, but nothing asks for
 * them and nothing scores them any more.
 */
export const DIET_OCCASIONS: readonly DietOccasion[] = [
  { field: "lunch", title: "Lunch" },
  { field: "dinner", title: "Dinner" },
] as const;

export const POINTS_PER_DIET_OCCASION = 5;
export const DIET_MAX = DIET_OCCASIONS.length * POINTS_PER_DIET_OCCASION; // 10

export function challengeByRef(ref: ChallengeRef): ChallengeConfig {
  const found = CHALLENGES.find((c) => c.ref === ref);
  if (!found) throw new Error(`Unknown challenge ${ref}`);
  return found;
}
