"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { requireParticipant } from "@/lib/auth/guards";

/**
 * Storing and removing a browser's push subscription.
 *
 * The subscription is created in the browser and only registered here, so
 * these actions never decide whether notifications are on — the browser
 * permission does. What they hold is the address to push to.
 *
 * Every action is scoped to the signed-in participant, so one person can
 * never register or delete another's device.
 */

export interface PushActionState {
  ok: boolean;
  error?: string;
}

export async function registerPushDevice(
  subscription: { endpoint: string; p256dh: string; auth: string },
  userAgent: string,
): Promise<PushActionState> {
  const session = await requireParticipant();

  if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) {
    return { ok: false, error: "That subscription was incomplete." };
  }

  // The browser hands back the same endpoint for the same device, so a
  // re-subscribe updates rather than piling up duplicate rows. The keys can
  // change on a re-subscribe, which is why they are written again.
  await db
    .insert(pushSubscriptions)
    .values({
      participantId: session.participantId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      userAgent: userAgent.slice(0, 300),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        participantId: session.participantId,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        userAgent: userAgent.slice(0, 300),
      },
    });

  revalidatePath("/app/profile");
  return { ok: true };
}

export async function removePushDevice(endpoint: string): Promise<PushActionState> {
  const session = await requireParticipant();

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        // Scoped to the signed-in participant: an endpoint alone must not be
        // enough to unsubscribe somebody else's device.
        eq(pushSubscriptions.participantId, session.participantId),
      ),
    );

  revalidatePath("/app/profile");
  return { ok: true };
}
