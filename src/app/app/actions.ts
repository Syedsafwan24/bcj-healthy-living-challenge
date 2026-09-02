"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { dailyEntries } from "@/db/schema";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { requireParticipant } from "@/lib/auth/guards";
import { requestIp } from "@/lib/auth/session";
import type { IsoDate } from "@/lib/dates";
import { saveEntry } from "@/lib/scoring-save";
import { getSettings, participantMayWrite, refusalMessage } from "@/lib/settings";
import { dailyEntrySchema, fieldErrors } from "@/lib/validation";

/**
 * Daily entry — build specification section 8.1.
 *
 * The client sends raw inputs. No endpoint accepts a point value or a
 * percentage (V6 section 8). The browser may preview a score using the same
 * pure function for immediate feedback, and the server value replaces the
 * preview on save.
 *
 * The participant comes from the session cookie, never from the request body
 * (section 5.1).
 */

export interface EntryState {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
  saved?: {
    dailyPoints: number;
    maxPoints: number;
    dailyPercentage: number;
    weekPercentage: number;
    finalScore: number;
  };
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

export async function submitDay(
  _prev: EntryState | null,
  formData: FormData,
): Promise<EntryState> {
  const session = await requireParticipant();
  const settings = await getSettings();

  const parsed = dailyEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const values = parsed.data;
  const entryDate = values.entryDate as IsoDate;

  // The submission deadline and the correction window are enforced here, on
  // the server. A stale page cannot write outside them (open item O-4).
  const permission = participantMayWrite(settings, entryDate);
  if (!permission.allowed) {
    return { ok: false, error: refusalMessage(permission.reason!, settings) };
  }

  // A locked entry is past the correction window whatever the date maths
  // says, for example because the nightly job locked it early.
  const [existing] = await db
    .select()
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.participantId, session.participantId),
        eq(dailyEntries.entryDate, entryDate),
      ),
    )
    .limit(1);

  if (existing?.status === "locked") {
    return {
      ok: false,
      error:
        "This day has been locked. Ask a BCJ organiser if it needs to be corrected.",
    };
  }

  const saved = await saveEntry(settings, {
    participantId: session.participantId,
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

  if (existing && existing.status !== "missing") {
    // A self-correction inside the window is audited field by field.
    await recordFieldChanges(
      {
        action: "entry.self_corrected",
        entityType: "daily_entry",
        entityId: saved.entryId,
        actorParticipantId: session.participantId,
        reason: "Self-correction inside the correction window",
        ip,
      },
      {
        waterLitres: existing.waterLitres,
        steps: existing.steps,
        sleepHours: existing.sleepHours,
        c3CookAtHome: existing.c3CookAtHome,
        c4NoSugary: existing.c4NoSugary,
        c5Vegetables: existing.c5Vegetables,
        c6NoLateFood: existing.c6NoLateFood,
        c8Mindfulness: existing.c8Mindfulness,
        c9ScreenTime: existing.c9ScreenTime,
        breakfast: existing.breakfast,
        midMorning: existing.midMorning,
        lunch: existing.lunch,
        eveningSnack: existing.eveningSnack,
        dinner: existing.dinner,
      },
      values as unknown as Record<string, unknown>,
      TRACKED_FIELDS,
    );
  } else {
    await recordAudit({
      action: "entry.submitted",
      entityType: "daily_entry",
      entityId: saved.entryId,
      actorParticipantId: session.participantId,
      newValue: {
        entryDate,
        dailyPoints: saved.dailyPoints,
        maxPoints: saved.maxPoints,
      },
      ip,
    });
  }

  revalidatePath("/app");
  revalidatePath("/app/history");
  revalidatePath("/app/progress");
  revalidatePath("/app/leaderboard");

  return {
    ok: true,
    saved: {
      dailyPoints: saved.dailyPoints,
      maxPoints: saved.maxPoints,
      dailyPercentage: saved.dailyPercentage,
      weekPercentage: saved.weekPercentage,
      finalScore: saved.finalScore,
    },
  };
}
