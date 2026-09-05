import "server-only";

import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";

import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Browser push — the second half of the daily reminder.
 *
 * Email reaches everyone but is easy to leave unread; a notification is the
 * one that actually gets a day filled in. Both are opt-in and both are sent
 * by the same evening job, so a participant who has already recorded the day
 * gets neither.
 *
 * Nothing here carries a score or any health field. A notification appears on
 * a lock screen, where anyone holding the phone can read it, so it says only
 * that the day is not filled in (specification section 11).
 */

let configured = false;

function ready(): boolean {
  if (!env.pushConfigured) return false;
  if (!configured) {
    webpush.setVapidDetails(
      env.vapidSubject,
      env.vapidPublicKey,
      env.vapidPrivateKey,
    );
    configured = true;
  }
  return true;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification lands. */
  url: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  removed: number;
}

/**
 * Sends one message to every device a set of participants has registered.
 *
 * A push service answering 404 or 410 means that subscription is dead: the
 * browser has dropped it and it will never work again, so the row goes.
 * Anything else is a transient failure and the row stays for the next run.
 */
export async function sendPushToParticipants(
  participantIds: string[],
  message: PushMessage,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, removed: 0 };
  if (!ready() || participantIds.length === 0) return result;

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.participantId, participantIds));

  const dead: string[] = [];
  const payload = JSON.stringify(message);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
      result.sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        dead.push(subscription.id);
        result.removed += 1;
      } else {
        result.failed += 1;
        console.error("[push] send failed", status, error);
      }
    }
  }

  if (dead.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
  }

  return result;
}

/** Every participant with at least one device subscribed. */
export async function participantsWithPush(
  participantIds: string[],
): Promise<Set<string>> {
  if (participantIds.length === 0) return new Set();
  const rows = await db
    .select({ participantId: pushSubscriptions.participantId })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.participantId, participantIds));
  return new Set(rows.map((r) => r.participantId));
}

export async function countPushDevices(participantId: string): Promise<number> {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.participantId, participantId));
  return rows.length;
}
