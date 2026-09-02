import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, desc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";

import { db } from "@/db";
import { admins, participants, sessions } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Sessions — build specification section 6 and 2.3.
 *
 * A signed cookie carries the session id; the row in `sessions` carries the
 * state. No auth library: participants sign in with a code, admins with
 * email, password and TOTP.
 *
 * Participant and admin sessions use distinct cookie names so the two can
 * never be confused by a middleware bug (section 2.3).
 */

export const PARTICIPANT_COOKIE = "bcj_participant_session";
export const ADMIN_COOKIE = "bcj_admin_session";

/** Admin sessions: 8-hour absolute expiry, 30-minute idle timeout. */
export const ADMIN_ABSOLUTE_MINUTES = 8 * 60;
export const ADMIN_IDLE_MINUTES = 30;
/** Participant sessions are long-lived: the credential is a single code. */
export const PARTICIPANT_DAYS = 30;

type Subject = "participant" | "admin";

interface TokenPayload {
  sid: string;
  sub: Subject;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret);
}

async function signToken(
  payload: TokenPayload,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ sid: payload.sid, sub: payload.sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
}

async function readToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const sid = payload.sid as string | undefined;
    const sub = payload.sub as Subject | undefined;
    if (!sid || (sub !== "participant" && sub !== "admin")) return null;
    return { sid, sub };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Request metadata                                                    */
/* ------------------------------------------------------------------ */

export async function requestIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip");
}

export async function requestUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

/* ------------------------------------------------------------------ */
/* Creating sessions                                                   */
/* ------------------------------------------------------------------ */

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function createParticipantSession(participantId: string) {
  const expiresAt = new Date(Date.now() + PARTICIPANT_DAYS * 86_400_000);
  const [row] = await db
    .insert(sessions)
    .values({
      participantId,
      expiresAt,
      ip: (await requestIp()) ?? undefined,
      userAgent: (await requestUserAgent()) ?? undefined,
    })
    .returning({ id: sessions.id });

  const token = await signToken({ sid: row.id, sub: "participant" }, expiresAt);
  (await cookies()).set(PARTICIPANT_COOKIE, token, cookieOptions(expiresAt));
  return row.id;
}

export async function createAdminSession(adminId: string) {
  const now = Date.now();
  const expiresAt = new Date(now + ADMIN_ABSOLUTE_MINUTES * 60_000);
  const idleExpiresAt = new Date(now + ADMIN_IDLE_MINUTES * 60_000);

  const [row] = await db
    .insert(sessions)
    .values({
      adminId,
      expiresAt,
      idleExpiresAt,
      ip: (await requestIp()) ?? undefined,
      userAgent: (await requestUserAgent()) ?? undefined,
    })
    .returning({ id: sessions.id });

  const token = await signToken({ sid: row.id, sub: "admin" }, expiresAt);
  (await cookies()).set(ADMIN_COOKIE, token, cookieOptions(expiresAt));
  return row.id;
}

/* ------------------------------------------------------------------ */
/* Reading sessions                                                    */
/* ------------------------------------------------------------------ */

export interface ParticipantSession {
  sessionId: string;
  participantId: string;
  registrationId: string;
  displayName: string;
  fullName: string;
  status: string;
}

export interface AdminSession {
  sessionId: string;
  adminId: string;
  email: string;
  name: string;
  totpEnrolled: boolean;
  status: string;
}

/**
 * A session is valid only when revoked_at IS NULL, now() < expires_at and,
 * for admin sessions, now() < idle_expires_at (section 7).
 */
export const getParticipantSession = cache(
  async function getParticipantSession(): Promise<ParticipantSession | null> {
    const token = (await cookies()).get(PARTICIPANT_COOKIE)?.value;
    if (!token) return null;

    const payload = await readToken(token);
    if (!payload || payload.sub !== "participant") return null;

    const [row] = await db
      .select({
        sessionId: sessions.id,
        participantId: participants.id,
        registrationId: participants.registrationId,
        displayName: participants.displayName,
        fullName: participants.fullName,
        status: participants.status,
      })
      .from(sessions)
      .innerJoin(participants, eq(participants.id, sessions.participantId))
      .where(
        and(
          eq(sessions.id, payload.sid),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
        ),
      )
      .limit(1);

    return row ?? null;
  },
);

export const getAdminSession = cache(
  async function getAdminSession(): Promise<AdminSession | null> {
    const token = (await cookies()).get(ADMIN_COOKIE)?.value;
    if (!token) return null;

    const payload = await readToken(token);
    if (!payload || payload.sub !== "admin") return null;

    const [row] = await db
      .select({
        sessionId: sessions.id,
        adminId: admins.id,
        email: admins.email,
        name: admins.name,
        totpEnrolledAt: admins.totpEnrolledAt,
        status: admins.status,
      })
      .from(sessions)
      .innerJoin(admins, eq(admins.id, sessions.adminId))
      .where(
        and(
          eq(sessions.id, payload.sid),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
          gt(sessions.idleExpiresAt, sql`now()`),
        ),
      )
      .limit(1);

    if (!row) return null;
    if (row.status !== "active") return null;

    return {
      sessionId: row.sessionId,
      adminId: row.adminId,
      email: row.email,
      name: row.name,
      totpEnrolled: row.totpEnrolledAt !== null,
      status: row.status,
    };
  },
);

/**
 * Extends the 30-minute idle window without touching the absolute expiry.
 *
 * Wrapped in `cache` so it runs once per request. Both the admin layout and
 * the page inside it call `requireAdmin`, and without this every admin page
 * view issued two identical UPDATEs — writes that take locks and generate WAL
 * for no benefit.
 */
export const touchAdminSession = cache(async function touchAdminSession(
  sessionId: string,
): Promise<void> {
  // Capped at expires_at so activity can never push a session past its
  // 8-hour absolute limit.
  await db.execute(sql`
      UPDATE sessions
         SET idle_expires_at = least(
               now() + (${ADMIN_IDLE_MINUTES} || ' minutes')::interval,
               expires_at)
       WHERE id = ${sessionId}
         AND revoked_at IS NULL
    `);
});

/* ------------------------------------------------------------------ */
/* Ending sessions                                                     */
/* ------------------------------------------------------------------ */

export async function revokeSession(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeAllAdminSessions(
  adminId: string,
  exceptSessionId?: string,
): Promise<void> {
  const conditions = [
    eq(sessions.adminId, adminId),
    isNull(sessions.revokedAt),
  ];
  if (exceptSessionId) conditions.push(ne(sessions.id, exceptSessionId));
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions));
}

export async function revokeAllParticipantSessions(
  participantId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.participantId, participantId),
        isNull(sessions.revokedAt),
      ),
    );
}

export async function clearParticipantCookie(): Promise<void> {
  (await cookies()).delete(PARTICIPANT_COOKIE);
}

export async function clearAdminCookie(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}

/** Removes sessions that expired long ago. Called by the nightly job. */
export async function pruneExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, cutoff))
    .returning({ id: sessions.id });
  return deleted.length;
}

/** Sessions listed on /admin/security. */
export async function listAdminSessions(adminId: string) {
  return db
    .select({
      id: sessions.id,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      idleExpiresAt: sessions.idleExpiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(
      and(eq(sessions.adminId, adminId), gt(sessions.expiresAt, sql`now()`)),
    )
    .orderBy(desc(sessions.createdAt));
}
