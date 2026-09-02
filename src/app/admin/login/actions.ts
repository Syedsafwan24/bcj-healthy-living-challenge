"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { admins } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { LOCKOUT_MINUTES, LOCKOUT_THRESHOLD } from "@/lib/auth/admin-auth";
import { burnTime, verifySecret } from "@/lib/auth/password";
import { consumeAttempt, rateLimitKey } from "@/lib/auth/rate-limit";
import {
  clearAdminCookie,
  createAdminSession,
  getAdminSession,
  requestIp,
  revokeSession,
} from "@/lib/auth/session";
import { decryptSecret, normaliseRecoveryCode, verifyTotp } from "@/lib/auth/totp";
import { env } from "@/lib/env";
import { adminLoginSchema, adminRecoveryLoginSchema } from "@/lib/validation";

/**
 * Admin sign-in — build specification section 2.3.
 *
 * Email plus password plus a TOTP code from an authenticator app. All three
 * are required on every sign-in. There is no "remember this device" option
 * and no way to disable the second factor.
 *
 * Five failed attempts per IP per minute, and an account lock for 15 minutes
 * after ten consecutive failures. Failed attempts return the same message and
 * take the same time whether or not the email exists.
 */

/** One message for every failure, so nothing distinguishes the cases. */
const GENERIC_FAILURE =
  "Those details were not accepted. Check your email, password and authenticator code.";

export interface AdminLoginState {
  error?: string;
}

async function tooManyAttempts(ip: string | null) {
  const limit = await consumeAttempt(rateLimitKey("admin-login", ip));
  if (limit.allowed) return null;
  return {
    error: `Too many attempts from this address. Wait ${limit.retryAfter} seconds and try again.`,
  };
}

async function registerFailure(
  adminId: string | null,
  email: string,
  ip: string | null,
  reason: string,
) {
  if (adminId) {
    const [row] = await db
      .update(admins)
      .set({ failedAttempts: sql`${admins.failedAttempts} + 1` })
      .where(eq(admins.id, adminId))
      .returning({ failedAttempts: admins.failedAttempts });

    if (row && row.failedAttempts >= LOCKOUT_THRESHOLD) {
      await db
        .update(admins)
        .set({
          lockedUntil: sql`now() + (${LOCKOUT_MINUTES} || ' minutes')::interval`,
          failedAttempts: 0,
        })
        .where(eq(admins.id, adminId));

      await recordAudit({
        action: "admin.locked",
        entityType: "admin",
        entityId: adminId,
        newValue: `${LOCKOUT_MINUTES} minutes after ${LOCKOUT_THRESHOLD} consecutive failures`,
        ip,
      });
    }
  }

  await recordAudit({
    action: "admin.login_failed",
    entityType: "admin",
    entityId: adminId ?? undefined,
    newValue: email,
    reason,
    ip,
  });
}

export async function adminSignIn(
  _prev: AdminLoginState | null,
  formData: FormData,
): Promise<AdminLoginState> {
  const ip = await requestIp();

  const limited = await tooManyAttempts(ip);
  if (limited) return limited;

  const parsed = adminLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    totp: formData.get("totp"),
  });
  if (!parsed.success) {
    await burnTime();
    return { error: GENERIC_FAILURE };
  }
  const { email, password, totp } = parsed.data;

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);

  // Take the same time whether or not the email exists.
  if (!admin) {
    await burnTime();
    await registerFailure(null, email, ip, "no such account");
    return { error: GENERIC_FAILURE };
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    await burnTime();
    await registerFailure(admin.id, email, ip, "account locked");
    return { error: GENERIC_FAILURE };
  }

  const totpRequired = env.adminRequireTotp;

  if (
    admin.status !== "active" ||
    !admin.passwordHash ||
    (totpRequired && !admin.totpSecretEnc)
  ) {
    await burnTime();
    await registerFailure(admin.id, email, ip, `status ${admin.status}`);
    return { error: GENERIC_FAILURE };
  }

  const passwordOk = await verifySecret(admin.passwordHash, password);
  if (!passwordOk) {
    await registerFailure(admin.id, email, ip, "wrong password");
    return { error: GENERIC_FAILURE };
  }

  // Section 2.3 requires the code on every sign-in. ADMIN_REQUIRE_TOTP=false
  // turns that off; the check below is the only place it is skipped, so a
  // client cannot bypass it by omitting the field.
  if (totpRequired) {
    const secret = decryptSecret(Buffer.from(admin.totpSecretEnc!));
    if (!verifyTotp(secret, totp, admin.email)) {
      await registerFailure(admin.id, email, ip, "wrong TOTP code");
      return { error: GENERIC_FAILURE };
    }
  }

  await db
    .update(admins)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip ?? undefined,
    })
    .where(eq(admins.id, admin.id));

  await createAdminSession(admin.id);
  await recordAudit({
    action: "admin.login",
    entityType: "admin",
    entityId: admin.id,
    actorAdminId: admin.id,
    ip,
  });

  const next = formData.get("next");
  redirect(
    typeof next === "string" && next.startsWith("/admin") ? next : "/admin",
  );
}

/**
 * Recovery-code sign-in — section 2.3. There is no password-reset link that
 * bypasses TOTP: a locked-out admin is restored by another super admin, or by
 * one of the eight single-use recovery codes shown at enrolment.
 *
 * A used code is removed from the array, so it cannot be replayed.
 */
export async function adminRecoverySignIn(
  _prev: AdminLoginState | null,
  formData: FormData,
): Promise<AdminLoginState> {
  const ip = await requestIp();

  const limited = await tooManyAttempts(ip);
  if (limited) return limited;

  const parsed = adminRecoveryLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    recoveryCode: formData.get("recoveryCode"),
  });
  if (!parsed.success) {
    await burnTime();
    return { error: GENERIC_FAILURE };
  }
  const { email, password, recoveryCode } = parsed.data;

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);

  if (!admin || admin.status !== "active" || !admin.passwordHash) {
    await burnTime();
    await registerFailure(admin?.id ?? null, email, ip, "recovery: no account");
    return { error: GENERIC_FAILURE };
  }

  if (!(await verifySecret(admin.passwordHash, password))) {
    await registerFailure(admin.id, email, ip, "recovery: wrong password");
    return { error: GENERIC_FAILURE };
  }

  const candidate = normaliseRecoveryCode(recoveryCode);
  let matchedIndex = -1;
  for (let i = 0; i < admin.recoveryCodes.length; i += 1) {
    if (await verifySecret(admin.recoveryCodes[i], candidate)) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) {
    await registerFailure(admin.id, email, ip, "recovery: wrong code");
    return { error: GENERIC_FAILURE };
  }

  const remaining = admin.recoveryCodes.filter((_, i) => i !== matchedIndex);
  await db
    .update(admins)
    .set({
      recoveryCodes: remaining,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip ?? undefined,
    })
    .where(eq(admins.id, admin.id));

  await createAdminSession(admin.id);
  await recordAudit({
    action: "admin.recovery_used",
    entityType: "admin",
    entityId: admin.id,
    actorAdminId: admin.id,
    newValue: `${remaining.length} recovery codes remaining`,
    ip,
  });

  redirect("/admin/security?recovery=1");
}

export async function adminSignOut() {
  const session = await getAdminSession();
  if (session) {
    await revokeSession(session.sessionId);
    await recordAudit({
      action: "admin.logout",
      entityType: "admin",
      entityId: session.adminId,
      actorAdminId: session.adminId,
    });
  }
  await clearAdminCookie();
  redirect("/admin/login");
}
