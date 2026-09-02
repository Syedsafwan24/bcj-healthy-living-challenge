"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { admins, sessions } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { hashRecoveryCodes, verifyReauth } from "@/lib/auth/admin-auth";
import { requireAdmin } from "@/lib/auth/guards";
import { hashSecret } from "@/lib/auth/password";
import { requestIp, revokeSession } from "@/lib/auth/session";
import { generateRecoveryCodes } from "@/lib/auth/totp";
import { fieldErrors, passwordSchema, reauthSchema } from "@/lib/validation";

/**
 * An organiser's own security screen — build specification section 2.3.
 *
 * TOTP enrolment, recovery codes and active sessions. An admin can see and
 * revoke their own sessions; a super admin can revoke anyone's from
 * /admin/accounts.
 */

export interface SecurityState {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
  recoveryCodes?: string[];
}

/** Revokes one of the signed-in admin's own sessions. */
export async function revokeOwnSession(
  _prev: SecurityState | null,
  formData: FormData,
): Promise<SecurityState> {
  const admin = await requireAdmin();
  const sessionId = String(formData.get("sessionId") ?? "");

  // Scoped to this admin's own rows, so a crafted id cannot revoke someone
  // else's session.
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.adminId, admin.adminId)))
    .limit(1);

  if (!row) return { ok: false, error: "That session is not yours." };

  await revokeSession(sessionId);
  await recordAudit({
    action: "admin.session_revoked",
    entityType: "session",
    entityId: sessionId,
    actorAdminId: admin.adminId,
    reason:
      sessionId === admin.sessionId
        ? "Revoked their own current session"
        : "Revoked one of their own sessions",
    ip: await requestIp(),
  });

  revalidatePath("/admin/security");
  return {
    ok: true,
    message:
      sessionId === admin.sessionId
        ? "This session has been revoked. You will be signed out on your next action."
        : "Session revoked.",
  };
}

/** Revokes every other session for the signed-in admin. */
export async function revokeOtherSessions(): Promise<SecurityState> {
  const admin = await requireAdmin();

  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.adminId, admin.adminId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });

  const others = revoked.filter((r) => r.id !== admin.sessionId);

  await recordAudit({
    action: "admin.session_revoked",
    entityType: "admin",
    entityId: admin.adminId,
    actorAdminId: admin.adminId,
    newValue: `${revoked.length} sessions revoked`,
    reason: "Signed out everywhere",
    ip: await requestIp(),
  });

  revalidatePath("/admin/security");
  return {
    ok: true,
    message: `${others.length} other session${others.length === 1 ? "" : "s"} revoked. This one has been revoked too — sign in again.`,
  };
}

/**
 * Issues eight fresh recovery codes and discards the old ones. Needs the
 * password and TOTP again, because the codes are a sign-in path.
 */
export async function regenerateRecoveryCodes(
  _prev: SecurityState | null,
  formData: FormData,
): Promise<SecurityState> {
  const admin = await requireAdmin();

  const parsed = reauthSchema.safeParse({
    password: formData.get("password"),
    totp: formData.get("totp"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const verified = await verifyReauth(
    admin.adminId,
    parsed.data.password,
    parsed.data.totp,
  );
  if (!verified) {
    return {
      ok: false,
      error: "Those details were not accepted. Your existing codes still work.",
    };
  }

  const codes = generateRecoveryCodes();
  await db
    .update(admins)
    .set({ recoveryCodes: await hashRecoveryCodes(codes) })
    .where(eq(admins.id, admin.adminId));

  await recordAudit({
    action: "admin.recovery_regenerated",
    entityType: "admin",
    entityId: admin.adminId,
    actorAdminId: admin.adminId,
    newValue: `${codes.length} new codes issued, previous codes discarded`,
    ip: await requestIp(),
  });

  revalidatePath("/admin/security");
  return { ok: true, recoveryCodes: codes };
}

/**
 * Changes the signed-in admin's password. NIST 800-63B: no composition rules
 * and no forced rotation, so this exists for a suspected compromise rather
 * than as a routine.
 */
export async function changePassword(
  _prev: SecurityState | null,
  formData: FormData,
): Promise<SecurityState> {
  const admin = await requireAdmin();

  const parsed = reauthSchema.safeParse({
    password: formData.get("currentPassword"),
    totp: formData.get("totp"),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const newPassword = passwordSchema.safeParse(formData.get("newPassword"));
  if (!newPassword.success) {
    return { ok: false, errors: { newPassword: newPassword.error.issues[0].message } };
  }

  if (formData.get("newPassword") !== formData.get("confirmPassword")) {
    return { ok: false, errors: { confirmPassword: "The two passwords do not match" } };
  }

  const verified = await verifyReauth(
    admin.adminId,
    parsed.data.password,
    parsed.data.totp,
  );
  if (!verified) {
    return { ok: false, error: "Those details were not accepted. Nothing was changed." };
  }

  await db
    .update(admins)
    .set({ passwordHash: await hashSecret(newPassword.data) })
    .where(eq(admins.id, admin.adminId));

  await recordAudit({
    action: "admin.password_changed",
    entityType: "admin",
    entityId: admin.adminId,
    actorAdminId: admin.adminId,
    ip: await requestIp(),
  });

  revalidatePath("/admin/security");
  return {
    ok: true,
    message:
      "Password changed. Other sessions stay signed in — revoke them below if you suspect the old password was known.",
  };
}
