"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { admins, auditLog, sessions } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  INVITE_HOURS,
  countOtherActiveAdmins,
  revokeAdminSessions,
  verifyReauth,
} from "@/lib/auth/admin-auth";
import { requireAdmin } from "@/lib/auth/guards";
import { hashSecret } from "@/lib/auth/password";
import { requestIp } from "@/lib/auth/session";
import { sendAdminInvite } from "@/lib/email";
import { fieldErrors, inviteAdminSchema, reauthSchema } from "@/lib/validation";

/**
 * Organiser accounts — build specification section 2.3.
 *
 * No self-registration. An existing super admin sends an invite, a single-use
 * token valid for 48 hours. Creating or disabling an account requires
 * re-authentication with password and TOTP, regardless of an active session.
 *
 * The application refuses to disable the last remaining active admin.
 */

export interface AccountState {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
  inviteUrl?: string;
}

async function reauthenticate(
  adminId: string,
  formData: FormData,
  purpose: string,
): Promise<{ ok: true } | { ok: false; state: AccountState }> {
  const parsed = reauthSchema.safeParse({
    password: formData.get("password"),
    totp: formData.get("totp"),
  });
  if (!parsed.success) {
    return { ok: false, state: { ok: false, errors: fieldErrors(parsed.error) } };
  }

  const verified = await verifyReauth(
    adminId,
    parsed.data.password,
    parsed.data.totp,
  );
  const ip = await requestIp();

  if (!verified) {
    await recordAudit({
      action: "admin.login_failed",
      entityType: "admin",
      entityId: adminId,
      actorAdminId: adminId,
      reason: `Re-authentication failed: ${purpose}`,
      ip,
    });
    return {
      ok: false,
      state: {
        ok: false,
        error: "Those details were not accepted. Nothing was changed.",
      },
    };
  }

  await recordAudit({
    action: "admin.reauthenticated",
    entityType: "admin",
    entityId: adminId,
    actorAdminId: adminId,
    reason: purpose,
    ip,
  });
  return { ok: true };
}

export async function inviteAdmin(
  _prev: AccountState | null,
  formData: FormData,
): Promise<AccountState> {
  const admin = await requireAdmin();

  const reauth = await reauthenticate(admin.adminId, formData, "Inviting an organiser");
  if (!reauth.ok) return reauth.state;

  const parsed = inviteAdminSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }
  const { email, name } = parsed.data;

  const [existing] = await db
    .select({ id: admins.id, status: admins.status })
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);

  if (existing && existing.status === "active") {
    return { ok: false, error: `${email} already has an active organiser account.` };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = await hashSecret(token);
  const ip = await requestIp();

  if (existing) {
    // Re-inviting an invited or disabled account replaces the old token, so
    // the previous link stops working.
    await db
      .update(admins)
      .set({
        name,
        status: "invited",
        inviteTokenHash: tokenHash,
        inviteExpiresAt: sql`now() + (${INVITE_HOURS} || ' hours')::interval`,
        passwordHash: null,
        totpSecretEnc: null,
        totpEnrolledAt: null,
        recoveryCodes: [],
        failedAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(admins.id, existing.id));
    await revokeAdminSessions(existing.id);
  } else {
    await db.insert(admins).values({
      email,
      name,
      status: "invited",
      inviteTokenHash: tokenHash,
      inviteExpiresAt: sql`now() + (${INVITE_HOURS} || ' hours')::interval`,
      createdBy: admin.adminId,
    });
  }

  await recordAudit({
    action: "admin.invited",
    entityType: "admin",
    entityId: existing?.id,
    actorAdminId: admin.adminId,
    newValue: { email, name, expiresInHours: INVITE_HOURS },
    ip,
  });

  const delivery = await sendAdminInvite({
    to: email,
    name,
    token,
    invitedBy: admin.name,
  });

  revalidatePath("/admin/accounts");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://health.bcjed.com";
  return {
    ok: true,
    message: delivery.sent
      ? `Invitation sent to ${email}. The link is single use and expires in ${INVITE_HOURS} hours.`
      : `Invitation created, but the email could not be sent. Pass this link to ${email} yourself — it is single use and expires in ${INVITE_HOURS} hours.`,
    // Shown only when the email failed, so an organiser is never stranded.
    inviteUrl: delivery.sent ? undefined : `${appUrl}/admin/invite/${token}`,
  };
}

export async function setAdminStatus(
  _prev: AccountState | null,
  formData: FormData,
): Promise<AccountState> {
  const admin = await requireAdmin();
  const targetId = String(formData.get("adminId") ?? "");
  const nextStatus = String(formData.get("status") ?? "");

  if (nextStatus !== "active" && nextStatus !== "disabled") {
    return { ok: false, error: "Unknown status." };
  }

  const purpose =
    nextStatus === "disabled" ? "Disabling an organiser" : "Re-enabling an organiser";
  const reauth = await reauthenticate(admin.adminId, formData, purpose);
  if (!reauth.ok) return reauth.state;

  const [target] = await db
    .select({ id: admins.id, email: admins.email, status: admins.status })
    .from(admins)
    .where(eq(admins.id, targetId))
    .limit(1);

  if (!target) return { ok: false, error: "That account no longer exists." };

  // At least two super admin accounts must exist. Refuse to disable the last
  // active one, including yourself.
  if (nextStatus === "disabled") {
    const others = await countOtherActiveAdmins(target.id);
    if (others === 0) {
      return {
        ok: false,
        error:
          "This is the only active organiser account. Invite and enrol a second one before disabling it, or BCJ is locked out of its own competition.",
      };
    }
  }

  await db
    .update(admins)
    .set({
      status: nextStatus,
      ...(nextStatus === "disabled"
        ? { failedAttempts: 0, lockedUntil: null }
        : {}),
    })
    .where(eq(admins.id, target.id));

  if (nextStatus === "disabled") await revokeAdminSessions(target.id);

  await recordAudit({
    action: nextStatus === "disabled" ? "admin.disabled" : "admin.enabled",
    entityType: "admin",
    entityId: target.id,
    actorAdminId: admin.adminId,
    oldValue: target.status,
    newValue: nextStatus,
    ip: await requestIp(),
  });

  revalidatePath("/admin/accounts");
  return {
    ok: true,
    message:
      nextStatus === "disabled"
        ? `${target.email} disabled and every session revoked.`
        : `${target.email} re-enabled.`,
  };
}

/** Clears a lockout early, for an organiser who is locked out by mistake. */
export async function unlockAdmin(
  _prev: AccountState | null,
  formData: FormData,
): Promise<AccountState> {
  const admin = await requireAdmin();
  const targetId = String(formData.get("adminId") ?? "");

  await db
    .update(admins)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(admins.id, targetId));

  await recordAudit({
    action: "admin.enabled",
    entityType: "admin",
    entityId: targetId,
    actorAdminId: admin.adminId,
    reason: "Lockout cleared by another organiser",
    ip: await requestIp(),
  });

  revalidatePath("/admin/accounts");
  return { ok: true, message: "Lockout cleared." };
}

/**
 * Removes a disabled organiser account outright.
 *
 * Only a disabled account can be deleted, so removal is always two deliberate
 * steps: disable, then delete. That ordering also means the "last active
 * organiser" guard on disabling cannot be walked around by deleting instead,
 * and it gives an obvious way back — re-enable — right up until the moment
 * someone chooses to remove the row.
 *
 * Deleting is for an account created by mistake or a volunteer who has left.
 * The audit history keeps every action they took: audit rows reference the
 * admin id, so those are detached first rather than being deleted with the
 * account. What an organiser did to a participant's score outlives their
 * account, which is the point of an audit log (V6 section 8).
 */
export async function deleteAdmin(
  _prev: AccountState | null,
  formData: FormData,
): Promise<AccountState> {
  const admin = await requireAdmin();
  const targetId = String(formData.get("adminId") ?? "");

  if (targetId === admin.adminId) {
    return { ok: false, error: "You cannot delete the account you are signed in with." };
  }

  const reauth = await reauthenticate(
    admin.adminId,
    formData,
    "Deleting an organiser",
  );
  if (!reauth.ok) return reauth.state;

  const [target] = await db
    .select({ id: admins.id, email: admins.email, name: admins.name, status: admins.status })
    .from(admins)
    .where(eq(admins.id, targetId))
    .limit(1);

  if (!target) return { ok: false, error: "That account no longer exists." };

  if (target.status === "active") {
    return {
      ok: false,
      error:
        "Disable this account first. Deleting an active organiser in one step is too easy to do by accident.",
    };
  }

  const ip = await requestIp();

  // Written before the row goes, with the details inline, because the audit
  // entry has to still make sense once there is no account to look up.
  await recordAudit({
    action: "admin.deleted",
    entityType: "admin",
    entityId: target.id,
    actorAdminId: admin.adminId,
    oldValue: `${target.name} <${target.email}>`,
    reason: "Organiser account deleted",
    ip,
  });

  await db.transaction(async (tx) => {
    // audit_log.actor_admin_id references admins without ON DELETE, so the
    // history is detached rather than dragged down with the account.
    await tx
      .update(auditLog)
      .set({ actorAdminId: null })
      .where(eq(auditLog.actorAdminId, target.id));

    // Any account this organiser invited keeps existing on its own.
    await tx
      .update(admins)
      .set({ createdBy: null })
      .where(eq(admins.createdBy, target.id));

    await tx.delete(sessions).where(eq(sessions.adminId, target.id));
    await tx.delete(admins).where(eq(admins.id, target.id));
  });

  revalidatePath("/admin/accounts");
  return { ok: true, message: `${target.name} has been deleted.` };
}
