"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import { admins } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { hashRecoveryCodes } from "@/lib/auth/admin-auth";
import { hashSecret, verifySecret } from "@/lib/auth/password";
import { createAdminSession, requestIp } from "@/lib/auth/session";
import {
  encryptSecret,
  generateRecoveryCodes,
  verifyTotp,
} from "@/lib/auth/totp";
import { env } from "@/lib/env";
import { acceptInviteSchema, fieldErrors } from "@/lib/validation";

/**
 * Accepting an admin invite — build specification section 2.3.
 *
 * No self-registration. An existing super admin sends an invite, which is a
 * single-use token valid for 48 hours. The invited person sets their password
 * and enrols TOTP on first sign-in, in one step. An admin account cannot
 * reach any admin route until TOTP enrolment completes.
 */

export interface AcceptState {
  errors?: Record<string, string>;
  error?: string;
  recoveryCodes?: string[];
}

/**
 * Finds the invited account for a raw token. Tokens are stored only as
 * argon2id hashes, so every invited row has to be checked; the set is tiny.
 */
async function findInvite(token: string) {
  const candidates = await db
    .select({
      id: admins.id,
      email: admins.email,
      name: admins.name,
      inviteTokenHash: admins.inviteTokenHash,
    })
    .from(admins)
    .where(
      and(
        eq(admins.status, "invited"),
        gt(admins.inviteExpiresAt, sql`now()`),
      ),
    );

  for (const candidate of candidates) {
    if (await verifySecret(candidate.inviteTokenHash, token)) return candidate;
  }
  return null;
}

/** Used by the page to render the form only for a live invite. */
export async function lookupInvite(token: string) {
  const invite = await findInvite(token);
  return invite ? { email: invite.email, name: invite.name } : null;
}

export async function acceptInvite(
  _prev: AcceptState | null,
  formData: FormData,
): Promise<AcceptState> {
  const parsed = acceptInviteSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    totp: formData.get("totp"),
  });
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }
  const { token, password, totp } = parsed.data;

  const invite = await findInvite(token);
  if (!invite) {
    return {
      error:
        "This invitation is no longer valid. Invitations are single use and expire after 48 hours. Ask another organiser to send a new one.",
    };
  }

  const totpRequired = env.adminRequireTotp;

  // The secret was generated when the page rendered and travels back in the
  // form, so the code the admin typed is verified against the same secret
  // that produced their QR code.
  const secret = formData.get("secret");

  if (totpRequired) {
    if (typeof secret !== "string" || secret.length < 16) {
      return {
        error: "The enrolment session expired. Reload the page and start again.",
      };
    }

    if (!verifyTotp(secret, totp, invite.email)) {
      return {
        errors: {
          totp: "That code did not match. Check your authenticator app and try the current code.",
        },
      };
    }
  }

  // Eight single-use recovery codes, shown once. Only hashes are stored.
  const recoveryCodes = generateRecoveryCodes();
  const now = new Date();

  await db
    .update(admins)
    .set({
      passwordHash: await hashSecret(password),
      totpSecretEnc:
        totpRequired && typeof secret === "string" ? encryptSecret(secret) : null,
      totpEnrolledAt: totpRequired ? now : null,
      recoveryCodes: await hashRecoveryCodes(recoveryCodes),
      status: "active",
      inviteTokenHash: null,
      inviteExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(admins.id, invite.id));

  const ip = await requestIp();
  await recordAudit({
    action: "admin.invite_accepted",
    entityType: "admin",
    entityId: invite.id,
    actorAdminId: invite.id,
    ip,
  });
  if (totpRequired) {
    await recordAudit({
      action: "admin.totp_enrolled",
      entityType: "admin",
      entityId: invite.id,
      actorAdminId: invite.id,
      ip,
    });
  }

  await createAdminSession(invite.id);

  // The codes are returned once and never again.
  return { recoveryCodes };
}

export async function finishEnrolment() {
  redirect("/admin");
}
