import "server-only";

import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import {
  getAdminSession,
  getParticipantSession,
  touchAdminSession,
  type AdminSession,
  type ParticipantSession,
} from "@/lib/auth/session";

/**
 * Route guards — build specification section 5.1.
 *
 * Every participant route is scoped to the signed-in participant. The server
 * derives the participant from the session cookie and never from a URL
 * parameter or request body. Nothing in the application takes a participant
 * id from the client.
 */

export async function requireParticipant(): Promise<ParticipantSession> {
  const session = await getParticipantSession();
  if (!session) redirect("/login");
  if (session.status === "withdrawn") redirect("/login?withdrawn=1");
  if (session.status !== "active") redirect("/login?pending=1");
  return session;
}

/**
 * An admin route. Also extends the 30-minute idle window, so an admin who is
 * working is not signed out mid-correction while one who walks away is.
 *
 * An admin account cannot reach any admin route until TOTP enrolment
 * completes (section 2.3).
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (env.adminRequireTotp && !session.totpEnrolled) {
    redirect("/admin/login?enrol=1");
  }
  await touchAdminSession(session.sessionId);
  return session;
}

/** For pages that must render for signed-out visitors too. */
export async function optionalParticipant(): Promise<ParticipantSession | null> {
  return getParticipantSession();
}
