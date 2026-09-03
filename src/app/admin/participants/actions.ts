"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { count, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { dailyEntries, participants } from "@/db/schema";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { requestIp, revokeAllParticipantSessions } from "@/lib/auth/session";
import { recomputeParticipant } from "@/lib/scoring-save";
import { getSettings } from "@/lib/settings";
import { fieldErrors, participantUpdateSchema } from "@/lib/validation";

/**
 * Participant administration — build specification section 5.2.
 *
 * Register and activate participants, assign a diet category, correct
 * details. Every change is written to `audit_log` with the actor, the field,
 * the old and new value and the IP (V6 section 8).
 */

export interface ParticipantActionState {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
}

const TRACKED = [
  "fullName",
  "displayName",
  "email",
  "mobile",
  "age",
  "gender",
  "heightCm",
  "weightKg",
  "startingWeightKg",
  "dietCategoryId",
  "status",
];

export async function updateParticipant(
  _prev: ParticipantActionState | null,
  formData: FormData,
): Promise<ParticipantActionState> {
  const admin = await requireAdmin();

  const raw = Object.fromEntries(formData) as Record<string, string>;
  if (raw.dietCategoryId === "" || raw.dietCategoryId === "none") {
    delete raw.dietCategoryId;
  }
  // Empty optional numbers arrive as ""; Zod's optional() wants undefined.
  for (const key of ["heightCm", "startingWeightKg", "age", "weightKg"]) {
    if (raw[key] === "") delete raw[key];
  }

  const parsed = participantUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const values = parsed.data;

  const [before] = await db
    .select()
    .from(participants)
    .where(eq(participants.id, values.participantId))
    .limit(1);

  if (!before) return { ok: false, error: "That participant no longer exists." };

  const [after] = await db
    .update(participants)
    .set({
      fullName: values.fullName,
      // No separate display-name input any more — see the note on
      // participantUpdateSchema.fullName.
      displayName: values.fullName,
      email: values.email,
      mobile: values.mobile,
      age: values.age ?? null,
      gender: values.gender,
      heightCm: values.heightCm != null ? String(values.heightCm) : null,
      weightKg: values.weightKg != null ? String(values.weightKg) : null,
      startingWeightKg:
        values.startingWeightKg != null ? String(values.startingWeightKg) : null,
      dietCategoryId: values.dietCategoryId ?? null,
      status: values.status,
    })
    .where(eq(participants.id, values.participantId))
    .returning();

  const ip = await requestIp();

  const changed = await recordFieldChanges(
    {
      action: "participant.updated",
      entityType: "participant",
      entityId: values.participantId,
      actorAdminId: admin.adminId,
      reason: values.reason || null,
      ip,
    },
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
    TRACKED,
  );

  // Status transitions get their own audit line, so activations and
  // withdrawals are findable without reading field diffs.
  if (before.status !== after.status) {
    await recordAudit({
      action:
        after.status === "active"
          ? "participant.activated"
          : after.status === "withdrawn"
            ? "participant.withdrawn"
            : "participant.updated",
      entityType: "participant",
      entityId: values.participantId,
      actorAdminId: admin.adminId,
      oldValue: before.status,
      newValue: after.status,
      reason: values.reason || null,
      ip,
    });

    // Someone who can no longer compete should not keep a live session.
    if (after.status !== "active") {
      await revokeAllParticipantSessions(values.participantId);
    }
  }

  if (before.dietCategoryId !== after.dietCategoryId) {
    await recordAudit({
      action: "participant.diet_assigned",
      entityType: "participant",
      entityId: values.participantId,
      actorAdminId: admin.adminId,
      oldValue: before.dietCategoryId,
      newValue: after.dietCategoryId,
      reason: values.reason || null,
      ip,
    });
  }

  revalidatePath("/admin/participants");
  revalidatePath(`/admin/participants/${values.participantId}`);
  revalidatePath("/app/leaderboard");

  return {
    ok: true,
    message:
      changed === 0
        ? "Nothing changed."
        : `Saved. ${changed} field${changed === 1 ? "" : "s"} updated and recorded in the audit history.`,
  };
}

/**
 * Rescores one participant from their stored raw inputs. A repair, not a
 * routine action: every entry is recomputed from `lib/scoring.ts` and the
 * weekly and final rows are rebuilt.
 */
export async function recomputeOne(
  _prev: ParticipantActionState | null,
  formData: FormData,
): Promise<ParticipantActionState> {
  const admin = await requireAdmin();
  const participantId = String(formData.get("participantId") ?? "");
  if (!participantId) return { ok: false, error: "No participant given." };

  const settings = await getSettings();
  const result = await recomputeParticipant(settings, participantId);

  await recordAudit({
    action: "scores.recomputed",
    entityType: "participant",
    entityId: participantId,
    actorAdminId: admin.adminId,
    newValue: {
      days: result.days,
      finalScore: result.finalScore,
    },
    reason: "Manual recomputation from the participant screen",
    ip: await requestIp(),
  });

  revalidatePath(`/admin/participants/${participantId}`);

  return {
    ok: true,
    message: `Rescored ${result.days} day${result.days === 1 ? "" : "s"}. Final score ${result.finalScore.toFixed(1)}.`,
  };
}

/**
 * Deletes a participant outright.
 *
 * Only allowed while they have no daily records. Once someone has logged a
 * day their entries feed weekly and final scores, and the audit history refers
 * to them; removing that would erase part of the competition's record rather
 * than tidy it. Anyone with history is put on hold instead, which stops them
 * competing while leaving the trail intact.
 *
 * This exists for the ordinary case of a duplicate or mistaken registration —
 * a real need now that registration is self-service and auto-approved.
 */
export async function deleteParticipant(
  _prev: ParticipantActionState | null,
  formData: FormData,
): Promise<ParticipantActionState> {
  const admin = await requireAdmin();
  const participantId = String(formData.get("participantId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const [participant] = await db
    .select({
      id: participants.id,
      registrationId: participants.registrationId,
      fullName: participants.fullName,
      email: participants.email,
    })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);

  if (!participant) {
    return { ok: false, error: "That participant no longer exists." };
  }

  const [{ value: entryCount }] = await db
    .select({ value: count() })
    .from(dailyEntries)
    .where(eq(dailyEntries.participantId, participantId));

  if (entryCount > 0) {
    return {
      ok: false,
      error:
        `${participant.fullName} has ${entryCount} recorded day${entryCount === 1 ? "" : "s"}, ` +
        "so they cannot be deleted. Put them on hold instead — that stops them competing and keeps their records.",
    };
  }

  const ip = await requestIp();

  // Recorded before the row goes, and with the identifying details inline,
  // because the audit entry has to still make sense once the row is gone.
  await recordAudit({
    action: "participant.deleted",
    entityType: "participant",
    entityId: participantId,
    actorAdminId: admin.adminId,
    oldValue: {
      registrationId: participant.registrationId,
      fullName: participant.fullName,
      email: participant.email,
    },
    reason: reason || "Deleted before any day was recorded",
    ip,
  });

  // audit_log holds a foreign key to participants and is append-only, so the
  // actor reference is detached rather than deleted. Everything else — health,
  // sessions, weekly and final scores — cascades.
  await db.execute(
    sql`UPDATE audit_log SET actor_participant_id = NULL
         WHERE actor_participant_id = ${participantId}`,
  );
  await db.delete(participants).where(eq(participants.id, participantId));

  revalidatePath("/admin/participants");
  revalidatePath("/admin/leaderboard");

  redirect("/admin/participants?deleted=1");
}

/**
 * Changes only the status, from the controls beside the participant's name.
 *
 * Separate from `updateParticipant` because suspending or withdrawing someone
 * is a deliberate act rather than part of correcting their details, and it
 * should not require resubmitting the whole form.
 */
export async function setParticipantStatus(
  _prev: ParticipantActionState | null,
  formData: FormData,
): Promise<ParticipantActionState> {
  const admin = await requireAdmin();
  const participantId = String(formData.get("participantId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!["pending", "active", "withdrawn"].includes(status)) {
    return { ok: false, error: "Unknown status." };
  }

  const [before] = await db
    .select({ id: participants.id, status: participants.status, fullName: participants.fullName })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);

  if (!before) return { ok: false, error: "That participant no longer exists." };
  if (before.status === status) {
    return { ok: true, message: `${before.fullName} is already ${status}.` };
  }

  await db
    .update(participants)
    .set({ status })
    .where(eq(participants.id, participantId));

  await recordAudit({
    action:
      status === "active"
        ? "participant.activated"
        : status === "withdrawn"
          ? "participant.withdrawn"
          : "participant.updated",
    entityType: "participant",
    entityId: participantId,
    actorAdminId: admin.adminId,
    field: "status",
    oldValue: before.status,
    newValue: status,
    reason: reason || null,
    ip: await requestIp(),
  });

  // Someone who can no longer compete should not keep a live session.
  if (status !== "active") {
    await revokeAllParticipantSessions(participantId);
  }

  revalidatePath("/admin/participants");
  revalidatePath(`/admin/participants/${participantId}`);
  revalidatePath("/admin/leaderboard");
  revalidatePath("/app/leaderboard");

  const wording =
    status === "active"
      ? "is active again"
      : status === "withdrawn"
        ? "has been withdrawn"
        : "is on hold";
  return { ok: true, message: `${before.fullName} ${wording}.` };
}
