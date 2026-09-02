"use server";

import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { participants } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { consumeAttempt, rateLimitKey } from "@/lib/auth/rate-limit";
import {
  clearParticipantCookie,
  createParticipantSession,
  getParticipantSession,
  requestIp,
  revokeSession,
} from "@/lib/auth/session";
import { sendRecoveredIds } from "@/lib/email";
import {
  fieldErrors,
  participantLoginSchema,
  recoverSchema,
} from "@/lib/validation";

/**
 * Participant sign-in — build specification section 2.1 and 2.2.
 *
 * No password, no OTP, no magic link. The registration ID is the credential.
 * Because one email may register several participants, each has their own ID
 * and signs in separately; there is no profile switcher.
 *
 * Sign-in is rate limited to five attempts per IP per minute. This matters
 * more than usual because the registration ID is the only credential.
 */

export interface LoginState {
  error?: string;
  ok?: boolean;
}

export async function signIn(
  _prev: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const ip = await requestIp();

  const limit = await consumeAttempt(rateLimitKey("participant-login", ip));
  if (!limit.allowed) {
    return {
      error: `Too many attempts. Wait ${limit.retryAfter} seconds and try again.`,
    };
  }

  const parsed = participantLoginSchema.safeParse({
    registrationId: formData.get("registrationId"),
  });
  if (!parsed.success) {
    return { error: fieldErrors(parsed.error).registrationId ?? "Enter your registration ID" };
  }

  const [participant] = await db
    .select({
      id: participants.id,
      status: participants.status,
      registrationId: participants.registrationId,
    })
    .from(participants)
    .where(eq(participants.registrationId, parsed.data.registrationId))
    .limit(1);

  if (!participant) {
    await recordAudit({
      action: "participant.login_failed",
      entityType: "participant",
      newValue: parsed.data.registrationId,
      ip,
    });
    // The same message whether or not the ID exists.
    return { error: "That registration ID was not recognised." };
  }

  if (participant.status === "withdrawn") {
    return {
      error:
        "This registration has been withdrawn. Speak to a BCJ organiser if that is not right.",
    };
  }

  if (participant.status !== "active") {
    return {
      error:
        "This registration is on hold. Speak to a BCJ organiser — they can put it back to active.",
    };
  }

  await createParticipantSession(participant.id);
  await recordAudit({
    action: "participant.login",
    entityType: "participant",
    entityId: participant.id,
    actorParticipantId: participant.id,
    ip,
  });

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/app") ? next : "/app");
}

/**
 * Lost-ID recovery, section 2.1: the participant enters an email address and
 * every ID registered against it is re-sent to that address.
 *
 * The response is the same whether or not the address is known, so the form
 * cannot be used to discover who has registered.
 */
export async function recoverIds(
  _prev: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const ip = await requestIp();

  const limit = await consumeAttempt(rateLimitKey("participant-recover", ip));
  if (!limit.allowed) {
    return {
      error: `Too many attempts. Wait ${limit.retryAfter} seconds and try again.`,
    };
  }

  const parsed = recoverSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter a valid email address" };
  }

  const rows = await db
    .select({
      id: participants.id,
      fullName: participants.fullName,
      registrationId: participants.registrationId,
      status: participants.status,
    })
    .from(participants)
    .where(eq(participants.email, parsed.data.email))
    .orderBy(asc(participants.seqNo));

  if (rows.length > 0) {
    await sendRecoveredIds({ to: parsed.data.email, people: rows });
    for (const row of rows) {
      await recordAudit({
        action: "participant.ids_resent",
        entityType: "participant",
        entityId: row.id,
        ip,
      });
    }
  }

  return { ok: true };
}

export async function signOut() {
  const session = await getParticipantSession();
  if (session) {
    await revokeSession(session.sessionId);
    await recordAudit({
      action: "participant.logout",
      entityType: "participant",
      entityId: session.participantId,
      actorParticipantId: session.participantId,
    });
  }
  await clearParticipantCookie();
  redirect("/login");
}
