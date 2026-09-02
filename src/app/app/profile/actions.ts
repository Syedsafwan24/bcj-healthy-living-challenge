"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { participants } from "@/db/schema";
import { recordFieldChanges } from "@/lib/audit";
import { requireParticipant } from "@/lib/auth/guards";
import { requestIp } from "@/lib/auth/session";
import { fieldErrors, participantSelfUpdateSchema } from "@/lib/validation";

/**
 * A participant correcting their own contact and body details.
 *
 * The fields are those that describe the person rather than their standing in
 * the challenge. Everything that decides a prize — diet category, gender,
 * starting weight — and everything published or used to sign in — display
 * name, email, registration ID, status — stays with the organisers. The
 * schema is the boundary; this action never reads a field it does not name,
 * so an extra input posted by hand cannot reach the update.
 *
 * Changes are written to the audit log with the participant as the actor, so
 * a self-correction and an organiser correction are told apart on
 * /admin/audit (V6 section 8).
 */

export interface ProfileActionState {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
}

const TRACKED = [
  "mobile",
  "age",
  "areaOfResidence",
  "residenceStatus",
  "heightCm",
  "weightKg",
];

export async function updateMyDetails(
  _prev: ProfileActionState | null,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await requireParticipant();

  const raw = Object.fromEntries(formData) as Record<string, string>;
  // An empty optional number arrives as ""; Zod's optional() wants undefined.
  if (raw.heightCm === "") delete raw.heightCm;

  const parsed = participantSelfUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const values = parsed.data;

  const [before] = await db
    .select()
    .from(participants)
    .where(eq(participants.id, session.participantId))
    .limit(1);

  if (!before) return { ok: false, error: "Your record could not be found." };

  const [after] = await db
    .update(participants)
    .set({
      mobile: values.mobile,
      age: values.age,
      areaOfResidence: values.areaOfResidence,
      residenceStatus: values.residenceStatus,
      heightCm: values.heightCm != null ? String(values.heightCm) : null,
      weightKg: String(values.weightKg),
    })
    .where(eq(participants.id, session.participantId))
    .returning();

  const changed = await recordFieldChanges(
    {
      action: "participant.updated",
      entityType: "participant",
      entityId: session.participantId,
      actorParticipantId: session.participantId,
      reason: "Changed by the participant on /app/profile",
      ip: await requestIp(),
    },
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
    TRACKED,
  );

  revalidatePath("/app/profile");

  return {
    ok: true,
    message:
      changed === 0
        ? "Nothing was changed."
        : `Saved. ${changed} detail${changed === 1 ? "" : "s"} updated.`,
  };
}
