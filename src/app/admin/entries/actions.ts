"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { dailyEntries, participants } from "@/db/schema";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { requestIp } from "@/lib/auth/session";
import { isScorableDate, type IsoDate } from "@/lib/dates";
import { saveEntry } from "@/lib/scoring-save";
import { getSettings } from "@/lib/settings";
import { adminEntryCorrectionSchema, fieldErrors } from "@/lib/validation";

/**
 * Admin corrections — build specification section 5.2 and 11.
 *
 * An admin corrects verified inputs. Scores recompute and are never edited
 * directly: no field on this path accepts a point value or a percentage
 * (V6 section 8).
 *
 * Every correction records the actor, timestamp, old value, new value and a
 * required reason (V5 section 12).
 */

export interface CorrectionState {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
}

const TRACKED_FIELDS = [
  "waterLitres",
  "steps",
  "sleepHours",
  "c3CookAtHome",
  "c4NoSugary",
  "c5Vegetables",
  "c6NoLateFood",
  "c8Mindfulness",
  "c9ScreenTime",
  "breakfast",
  "midMorning",
  "lunch",
  "eveningSnack",
  "dinner",
];

export async function correctEntry(
  _prev: CorrectionState | null,
  formData: FormData,
): Promise<CorrectionState> {
  const admin = await requireAdmin();
  const settings = await getSettings();

  const parsed = adminEntryCorrectionSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const values = parsed.data;
  const entryDate = values.entryDate as IsoDate;

  // An admin may correct at any time, including after the participant's own
  // window has closed, but not outside the competition itself.
  if (!isScorableDate(settings.startDate as IsoDate, settings.totalWeeks, entryDate)) {
    return {
      ok: false,
      error: `That date falls outside the ${settings.totalWeeks}-week competition window.`,
    };
  }

  const [participant] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.id, values.participantId))
    .limit(1);

  if (!participant) {
    return { ok: false, error: "That participant no longer exists." };
  }

  const [before] = await db
    .select()
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.participantId, values.participantId),
        eq(dailyEntries.entryDate, entryDate),
      ),
    )
    .limit(1);

  // A corrected day is 'submitted' again: it now carries verified inputs
  // rather than being an unfilled placeholder.
  const saved = await saveEntry(settings, {
    participantId: values.participantId,
    entryDate,
    status: "submitted",
    waterLitres: values.waterLitres,
    steps: values.steps,
    sleepHours: values.sleepHours,
    c3CookAtHome: values.c3CookAtHome,
    c4NoSugary: values.c4NoSugary,
    c5Vegetables: values.c5Vegetables,
    c6NoLateFood: values.c6NoLateFood,
    c8Mindfulness: values.c8Mindfulness,
    c9ScreenTime: values.c9ScreenTime,
    breakfast: values.breakfast,
    midMorning: values.midMorning,
    lunch: values.lunch,
    eveningSnack: values.eveningSnack,
    dinner: values.dinner,
  });

  const ip = await requestIp();

  const changed = await recordFieldChanges(
    {
      action: "entry.admin_corrected",
      entityType: "daily_entry",
      entityId: saved.entryId,
      actorAdminId: admin.adminId,
      actorParticipantId: values.participantId,
      reason: values.reason,
      ip,
    },
    before
      ? {
          waterLitres: before.waterLitres,
          steps: before.steps,
          sleepHours: before.sleepHours,
          c3CookAtHome: before.c3CookAtHome,
          c4NoSugary: before.c4NoSugary,
          c5Vegetables: before.c5Vegetables,
          c6NoLateFood: before.c6NoLateFood,
          c8Mindfulness: before.c8Mindfulness,
          c9ScreenTime: before.c9ScreenTime,
          breakfast: before.breakfast,
          midMorning: before.midMorning,
          lunch: before.lunch,
          eveningSnack: before.eveningSnack,
          dinner: before.dinner,
        }
      : {},
    values as unknown as Record<string, unknown>,
    TRACKED_FIELDS,
  );

  // The recomputation itself is recorded, so the audit shows that the day,
  // the week and the final score moved together.
  await recordAudit({
    action: "scores.recomputed",
    entityType: "daily_entry",
    entityId: saved.entryId,
    actorAdminId: admin.adminId,
    actorParticipantId: values.participantId,
    oldValue: before
      ? {
          // Both come back from numeric columns as fixed-scale strings.
          // Recorded as numbers so the audit reads 20.4, not "20.40".
          dailyPoints: Number(before.dailyPoints ?? 0),
          maxPoints: before.maxPoints,
          dailyPercentage: Number(before.dailyPercentage ?? 0),
        }
      : null,
    newValue: {
      dailyPoints: saved.dailyPoints,
      maxPoints: saved.maxPoints,
      dailyPercentage: saved.dailyPercentage,
      weekNo: saved.weekNo,
      weekPercentage: saved.weekPercentage,
      finalScore: saved.finalScore,
    },
    reason: values.reason,
    ip,
  });

  revalidatePath("/admin/entries");
  revalidatePath(`/admin/entries/${saved.entryId}/edit`);
  revalidatePath(`/admin/participants/${values.participantId}`);
  revalidatePath("/app");
  revalidatePath("/app/leaderboard");

  return {
    ok: true,
    message:
      `Saved. Week ${saved.weekNo}: ${saved.dailyPoints}/${saved.maxPoints} points, ` +
      `${saved.dailyPercentage.toFixed(4)}%. Week now ${saved.weekPercentage.toFixed(4)}%, ` +
      `final score ${saved.finalScore.toFixed(4)}. ` +
      `${changed} field${changed === 1 ? "" : "s"} recorded in the audit history.`,
  };
}
