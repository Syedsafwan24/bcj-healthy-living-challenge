"use server";

import { after } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { admins, participantHealth, participants } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { requestIp } from "@/lib/auth/session";
import { listDietCategories, suggestDietCategory } from "@/lib/diet";
import { sendNewRegistrationAlert, sendRegistrationId } from "@/lib/email";
import { env } from "@/lib/env";
import { buildRegistrationId } from "@/lib/registration-id";
import { fieldErrors, registrationSchema } from "@/lib/validation";

/**
 * Registration — build specification sections 1, 3 (O-7, O-13) and 10.
 *
 * Replaces the current 7-page Google Form. One email address may register
 * several participants; each receives a unique, unguessable registration ID
 * which is shown on screen and emailed to the address given.
 */

export interface RegisterResult {
  ok: boolean;
  registrationId?: string;
  emailed?: boolean;
  errors?: Record<string, string>;
}

/** Collision retries. The UNIQUE constraint is the real guard. */
const MAX_ID_ATTEMPTS = 5;

export async function registerParticipant(
  _prev: RegisterResult | null,
  formData: FormData,
): Promise<RegisterResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;

  // Empty optional fields arrive as "". Zod's optional() wants undefined.
  for (const key of [
    "heightCm",
    "startingWeightKg",
    "bloodGroup",
    "bloodPressure",
    "diabetesStatus",
    "bloodSugar",
  ]) {
    if (raw[key] === "") delete raw[key];
  }

  const parsed = registrationSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const values = parsed.data;

  // The diet category is suggested here from V5 section 6 and confirmed by an
  // admin on /admin/participants, which is where the assignment happens.
  const categories = await listDietCategories();
  const suggestion = suggestDietCategory(categories, values.age, values.weightKg);

  let created: { id: string; registrationId: string } | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS && !created; attempt += 1) {
    try {
      created = await db.transaction(async (tx) => {
        // seq_no is drawn from the sequence first, so the readable part of
        // the ID matches the column.
        const [seq] = (await tx.execute(
          sql`SELECT nextval('participant_seq')::int AS seq_no`,
        )) as unknown as Array<{ seq_no: number }>;

        // The suffix is taken from the participant's name — see the note at
        // the top of lib/registration-id.ts.
        const registrationId = buildRegistrationId(seq.seq_no, values.fullName);

        const [row] = await tx
          .insert(participants)
          .values({
            registrationId,
            seqNo: seq.seq_no,
            email: values.email,
            fullName: values.fullName,
            // The registration form collects one name; it stands in for the
            // display name everywhere that column is read (the leaderboard,
            // the admin roster). An organiser can still set a different
            // public name later from /admin/participants.
            displayName: values.fullName,
            mobile: values.mobile,
            age: values.age,
            gender: values.gender,
            areaOfResidence: values.areaOfResidence,
            residenceStatus: values.residenceStatus,
            heightCm: values.heightCm != null ? String(values.heightCm) : null,
            weightKg: String(values.weightKg),
            startingWeightKg:
              values.startingWeightKg != null
                ? String(values.startingWeightKg)
                : null,
            dietCategoryId: suggestion.categoryId,
            // Auto-approved at BCJ's request (1 September 2026). Specification
            // section 5.2 has an organiser activate each registration; BCJ
            // preferred participants to be able to start logging straight
            // away. An organiser can still withdraw someone, and the diet
            // category assigned here is a suggestion they can correct.
            status: "active",
          })
          .returning({
            id: participants.id,
            registrationId: participants.registrationId,
          });

        // Health fields go to a separate table, visible to super admins only.
        if (
          values.bloodGroup ||
          values.bloodPressure ||
          values.diabetesStatus ||
          values.bloodSugar
        ) {
          await tx.insert(participantHealth).values({
            participantId: row.id,
            bloodGroup: values.bloodGroup ?? null,
            bloodPressure: values.bloodPressure ?? null,
            diabetesStatus: values.diabetesStatus ?? null,
            bloodSugar: values.bloodSugar ?? null,
          });
        }

        return row;
      });
    } catch (error) {
      lastError = error;
      const message = String(error);
      // Only a registration_id collision is worth retrying.
      if (!message.includes("registration_id")) break;
    }
  }

  if (!created) {
    console.error("[register] failed", lastError);
    return {
      ok: false,
      errors: {
        form: "Registration could not be saved. Please try again, and tell a BCJ organiser if it keeps failing.",
      },
    };
  }

  await recordAudit({
    action: "participant.registered",
    entityType: "participant",
    entityId: created.id,
    actorParticipantId: created.id,
    newValue: {
      registrationId: created.registrationId,
      email: values.email,
      dietCategory: suggestion.code,
      dietNeedsReview: suggestion.needsReview,
    },
    ip: await requestIp(),
  });

  // Email is sent after the response, not before it.
  //
  // A Gmail SMTP round trip measures about 4 seconds, and registration sends
  // two messages — the participant's ID and the organiser alert. Awaiting them
  // held the form on "Registering..." for roughly 8 seconds while the row was
  // already safely committed and the ID already known.
  //
  // `after` runs once the response has been sent, so the participant sees their
  // ID immediately. Nothing here can fail the registration: the ID is shown on
  // screen and can be recovered by email later.
  const registrationId = created.registrationId;
  const participantId = created.id;

  after(async () => {
    try {
      await sendRegistrationId({
        to: values.email,
        fullName: values.fullName,
        registrationId,
      });
    } catch (error) {
      console.error("[register] could not email the registration ID", error);
    }

    // Tell the organisers, so a pending registration is not left waiting for
    // approval.
    try {
      const recipients = await db
        .select({ email: admins.email })
        .from(admins)
        .where(eq(admins.status, "active"));

      if (recipients.length > 0) {
        await sendNewRegistrationAlert({
          to: recipients.map((r) => r.email),
          fullName: values.fullName,
          registrationId,
          email: values.email,
          mobile: values.mobile,
          age: values.age,
          areaOfResidence: values.areaOfResidence,
          weightKg: String(values.weightKg),
          dietCategory: suggestion.title,
          dietNeedsReview: suggestion.needsReview,
          participantId,
        });
      }
    } catch (error) {
      console.error("[register] could not notify the organisers", error);
    }
  });

  return {
    ok: true,
    registrationId,
    // Whether a transport is configured, which is knowable now — not whether
    // the message landed, which is not.
    emailed: env.smtpConfigured,
  };
}
