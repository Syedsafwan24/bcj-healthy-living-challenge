import { z } from "zod";

import { genders } from "@/db/schema";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { isIsoDate } from "@/lib/dates";
import { normaliseRegistrationId } from "@/lib/registration-id";

/**
 * Validation — build specification sections 10 and 11.
 *
 * One schema per shape, shared by the form, the server action and the insert.
 * Numeric inputs are validated as non-negative here and again by CHECK
 * constraints in the database.
 *
 * No schema in this file accepts a point value or a percentage. Scores are
 * calculated on the server from raw inputs only (V6 section 8).
 */

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .pipe(z.email("Enter a valid email address"));

/** Saudi and international formats, kept permissive: BCJ verifies by hand. */
export const mobileSchema = z
  .string()
  .trim()
  .min(7, "Enter a mobile number")
  .max(24)
  .regex(/^[+0-9][0-9\s()-]*$/, "Use digits, spaces, brackets and + only");

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, "Enter a date as YYYY-MM-DD");

export const registrationIdSchema = z
  .string()
  .trim()
  .min(4, "Enter your registration ID")
  .max(32)
  .transform(normaliseRegistrationId);

/* ------------------------------------------------------------------ */
/* Registration — section 10                                           */
/* ------------------------------------------------------------------ */

export const registrationSchema = z.object({
  // Email is not on the current Google Form. It is required here because the
  // registration ID is delivered by email and the lost-ID recovery flow
  // depends on it — open item O-7.
  email: emailSchema,
  // Doubles as the display name shown on the leaderboard (V6 section 9). The
  // registration form asks for the name once; an organiser can still give
  // someone a separate public name later from /admin/participants if BCJ
  // ever needs to moderate one.
  fullName: trimmed(120),
  mobile: mobileSchema,
  // Optional at BCJ's request: without it, suggestDietCategory cannot apply
  // the kids-band check and flags the suggestion for an organiser to
  // confirm, same as an unmatched weight.
  age: z.coerce
    .number()
    .int("Enter age in whole years")
    .min(10, "The challenge is open from age 10")
    .max(100)
    .optional()
    .nullable(),
  gender: z.enum(genders),
  // Not collected at registration; an organiser can add it from
  // /admin/participants if BCJ wants it on file.
  heightCm: z.coerce.number().min(50).max(250).optional().nullable(),
  // Optional at BCJ's request. Decides which diet plan is suggested (V5
  // section 6); without it the suggestion is left for an organiser to assign
  // rather than guessed.
  weightKg: z.coerce
    .number()
    .min(20, "Enter weight in kilograms")
    .max(300, "Enter weight in kilograms")
    .optional()
    .nullable(),
  // Open item O-10: confirm whether this is the same measurement as weight.
  startingWeightKg: z.coerce.number().min(20).max(300).optional().nullable(),

  // Health fields, stored in participant_health and visible to admins only.
  bloodGroup: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
    .optional()
    .nullable(),
  diabetesStatus: z.enum(["no", "diagnosed", "not_sure"]).optional().nullable(),
});

export type RegistrationInput = z.input<typeof registrationSchema>;
export type RegistrationValues = z.output<typeof registrationSchema>;

export const bloodGroups = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

export const diabetesOptions = [
  { value: "no", label: "No" },
  { value: "diagnosed", label: "Yes — diagnosed" },
  { value: "not_sure", label: "Not sure" },
] as const;

/* ------------------------------------------------------------------ */
/* Sign-in                                                             */
/* ------------------------------------------------------------------ */

export const participantLoginSchema = z.object({
  registrationId: registrationIdSchema,
});

export const recoverSchema = z.object({
  email: emailSchema,
});

/**
 * A 6-digit authenticator code. Optional in the schema because
 * ADMIN_REQUIRE_TOTP decides whether it is required; the server action
 * refuses a missing code when the switch is on, so a client cannot skip the
 * second factor by omitting the field.
 */
const totpField = z
  .union([z.string(), z.undefined(), z.null()])
  .optional()
  .transform((v) => (v ?? "").toString().trim())
  .refine(
    (v) => v === "" || /^\d{6}$/.test(v),
    "Enter the 6-digit code from your authenticator app",
  );

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
  totp: totpField,
});

export const adminRecoveryLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  recoveryCode: z.string().trim().min(8, "Enter a recovery code").max(32),
});

export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Use at least ${MIN_PASSWORD_LENGTH} characters. There are no composition rules.`,
  )
  .max(200);

export const acceptInviteSchema = z
  .object({
    token: z.string().trim().min(16).max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
    totp: totpField,
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "The two passwords do not match",
    path: ["confirmPassword"],
  });

export const reauthSchema = z.object({
  password: z.string().min(1, "Enter your password").max(200),
  totp: totpField,
});

export const inviteAdminSchema = z.object({
  email: emailSchema,
  name: trimmed(120),
});

/* ------------------------------------------------------------------ */
/* Daily entry — the only inputs the server accepts for a day          */
/* ------------------------------------------------------------------ */

/**
 * A tri-state control: "yes", "no", or absent when the participant has not
 * touched it. An untouched control looks different from an explicit No on
 * screen, even though both score zero (section 9.5).
 */
const triState = z
  .union([z.enum(["yes", "no", ""]), z.boolean(), z.null()])
  .optional()
  .transform((v) => {
    if (v === true || v === "yes") return true;
    if (v === false || v === "no") return false;
    return null;
  });

const optionalNumber = (max: number, message: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : Number.NaN;
    })
    .refine((n) => n === null || (n >= 0 && n <= max), message);

export const dailyEntrySchema = z.object({
  entryDate: isoDateSchema,

  // C1, C2 and C7. Non-negative, with sane upper bounds so a typo cannot
  // store 1e9 steps. Points are capped at 10 regardless.
  waterLitres: optionalNumber(30, "Enter litres of water, 0 or more"),
  steps: optionalNumber(200_000, "Enter a step count, 0 or more").refine(
    (n) => n === null || Number.isInteger(n),
    "Enter a whole number of steps",
  ),
  sleepHours: optionalNumber(24, "Enter hours of sleep between 0 and 24"),

  // C3 to C6, C8, C9.
  c3CookAtHome: triState,
  c4NoSugary: triState,
  c5Vegetables: triState,
  c5VegetablesDinner: triState,
  c6NoLateFood: triState,
  c8Mindfulness: triState,
  c9ScreenTime: triState,

  // Diet. Only lunch and dinner are scored (5 points each); the other
  // three remain as columns so old rows keep their answers.
  breakfast: triState,
  midMorning: triState,
  lunch: triState,
  eveningSnack: triState,
  dinner: triState,
});

export type DailyEntryInput = z.input<typeof dailyEntrySchema>;
export type DailyEntryValues = z.output<typeof dailyEntrySchema>;

/** An admin correction is the same payload plus a required reason. */
export const adminEntryCorrectionSchema = dailyEntrySchema.extend({
  participantId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(5, "Record why this entry is being corrected")
    .max(500),
});

/* ------------------------------------------------------------------ */
/* Admin: participants and settings                                    */
/* ------------------------------------------------------------------ */

/**
 * Every field an organiser may correct. Registration is self-reported, so a
 * mis-typed name, age or gender needs fixing without going near the database.
 *
 * None of these affect a score: scoring reads only the daily entries. Age and
 * weight decide which diet category is *suggested* at registration, and the
 * category itself is assigned here anyway.
 */
export const participantUpdateSchema = z.object({
  participantId: z.uuid(),
  // Also stands in for the display name (see the note in registrationSchema
  // above) — there is no separate field for an organiser to diverge it with.
  fullName: trimmed(120),
  email: emailSchema,
  mobile: mobileSchema,
  // No longer collected at registration, so an existing record may not have
  // one yet. Optional here too, so correcting an unrelated field never forces
  // an organiser to also backfill these.
  age: z.coerce.number().int().min(10).max(100).optional().nullable(),
  gender: z.enum(genders),
  weightKg: z.coerce.number().min(20).max(300).optional().nullable(),
  dietCategoryId: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(["pending", "active", "withdrawn"]),
  reason: z.string().trim().max(500).optional(),
});

/**
 * What a participant may change about themselves on /app/profile.
 *
 * Deliberately narrower than participantUpdateSchema. Diet category and
 * gender ARE the prize division (see groupLeaderboard), starting weight is
 * the baseline any weight judging rests on, and the display name is what
 * appears on the leaderboard — letting a competitor set those would let them
 * pick their own competition class or publish an unmoderated name.
 *
 * Email is excluded for a different reason: the registration ID is the only
 * participant credential, so an account whose email can be changed from
 * inside the session can be taken over permanently by anyone who guesses one.
 * Changing it needs a verified flow, not a text box.
 */
export const participantSelfUpdateSchema = z.object({
  mobile: mobileSchema,
  // Neither of these is collected at registration any more, so neither is
  // required here — a participant correcting their mobile number should
  // never be blocked on supplying an age or weight nobody asked them for.
  age: z.coerce
    .number()
    .int("Enter age in whole years")
    .min(10, "The challenge is open from age 10")
    .max(100)
    .optional()
    .nullable(),
  weightKg: z.coerce
    .number()
    .min(20, "Enter weight in kilograms")
    .max(300, "Enter weight in kilograms")
    .optional()
    .nullable(),
});

export type ParticipantSelfUpdateValues = z.output<
  typeof participantSelfUpdateSchema
>;

export const settingsSchema = z.object({
  startDate: isoDateSchema,
  totalWeeks: z.coerce.number().int().min(1).max(52),
  maxActiveWeek: z.coerce.number().int().min(1).max(12),
  timezone: z.string().trim().min(3).max(64),
  submissionCutoff: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:MM"),
  missingScoresZero: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "on"),
});

export type SettingsValues = z.output<typeof settingsSchema>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Flattens a ZodError into the { field: message } shape the forms expect. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
