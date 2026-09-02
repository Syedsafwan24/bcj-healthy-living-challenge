import "server-only";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { admins, sessions } from "@/db/schema";
import { burnTime, hashSecret, verifySecret } from "@/lib/auth/password";
import { decryptSecret, normaliseRecoveryCode, verifyTotp } from "@/lib/auth/totp";
import { env } from "@/lib/env";

/**
 * Admin account helpers — build specification section 2.3.
 *
 * Deliberately not a "use server" module. Nothing here should be reachable as
 * an endpoint: these are called from server actions that have already
 * established who the caller is.
 */

/** Five failed attempts per IP per minute, and a lock after ten in a row. */
export const LOCKOUT_THRESHOLD = 10;
export const LOCKOUT_MINUTES = 15;

/** Invite tokens are single use and valid for 48 hours. */
export const INVITE_HOURS = 48;

/**
 * Re-authentication. The password and TOTP are requested again, regardless of
 * an active session, before creating or disabling an admin account, before
 * setting `rules_locked` back to false, and before a bulk export that
 * includes health fields.
 */
export async function verifyReauth(
  adminId: string,
  password: string,
  totp: string,
): Promise<boolean> {
  const [admin] = await db
    .select({
      passwordHash: admins.passwordHash,
      totpSecretEnc: admins.totpSecretEnc,
      email: admins.email,
      status: admins.status,
    })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);

  if (!admin || admin.status !== "active" || !admin.passwordHash) {
    await burnTime();
    return false;
  }

  if (!(await verifySecret(admin.passwordHash, password))) return false;

  // With ADMIN_REQUIRE_TOTP off, the password alone re-authenticates.
  if (!env.adminRequireTotp) return true;

  if (!admin.totpSecretEnc) {
    await burnTime();
    return false;
  }

  const secret = decryptSecret(Buffer.from(admin.totpSecretEnc));
  return verifyTotp(secret, totp, admin.email);
}

/**
 * At least two super admin accounts must exist. With mandatory TOTP and no
 * email-only reset path, a single account plus a lost phone locks BCJ out of
 * its own competition, so the application refuses to disable the last
 * remaining active admin.
 */
export async function countOtherActiveAdmins(exceptId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(admins)
    .where(and(eq(admins.status, "active"), ne(admins.id, exceptId)));
  return row?.value ?? 0;
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(
    codes.map((code) => hashSecret(normaliseRecoveryCode(code))),
  );
}

/** Revokes every live session for an admin. Used when disabling an account. */
export async function revokeAdminSessions(adminId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.adminId, adminId), isNull(sessions.revokedAt)));
}
