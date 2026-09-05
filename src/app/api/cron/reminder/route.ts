import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { dailyEntries, participants } from "@/db/schema";
import { sendDailyReminder } from "@/lib/email";
import { env } from "@/lib/env";
import { getMissedDays } from "@/lib/queries";
import { competitionClock, getSettings } from "@/lib/settings";

/**
 * The evening reminder.
 *
 * One run a day, a few hours before the cutoff, emailing the participants
 * who have not filled in today. It is deliberately separate from the nightly
 * job: that one runs *after* the cutoff and closes the day, which is far too
 * late to be useful as a nudge, and a job that scores days should not also be
 * the job that sends mail — a mail failure must never leave scoring half
 * done.
 *
 * Nobody who has already filled in today hears from it, so keeping up means
 * silence. Nothing is sent before the challenge starts or after it ends.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ReminderResult {
  ran: boolean;
  today: string;
  weekNo: number | null;
  candidates: number;
  sent: number;
  failed: number;
  message?: string;
}

/**
 * Sent one at a time rather than as one message with many recipients: a
 * reminder names the participant and counts their own empty days, and a
 * shared To line would disclose every participant's address to every other.
 */
async function runReminder(): Promise<ReminderResult> {
  const settings = await getSettings();
  const clock = competitionClock(settings);

  const base: ReminderResult = {
    ran: false,
    today: clock.today,
    weekNo: clock.currentWeek,
    candidates: 0,
    sent: 0,
    failed: 0,
  };

  if (!clock.started || clock.finished) {
    return { ...base, message: "The challenge is not running." };
  }

  if (!env.smtpConfigured) {
    return { ...base, message: "SMTP is not configured, so nothing was sent." };
  }

  // Everyone still competing who wants to hear from us.
  const people = await db
    .select({
      id: participants.id,
      email: participants.email,
      fullName: participants.fullName,
    })
    .from(participants)
    .where(
      and(
        eq(participants.status, "active"),
        eq(participants.reminderEmails, true),
      ),
    );

  if (people.length === 0) {
    return { ...base, ran: true, message: "Nobody to remind." };
  }

  // One query for the whole roster rather than one per participant. A
  // "missing" row is one the nightly job wrote for an unrecorded day, so it
  // does not count as filled in.
  const filledToday = await db
    .select({ participantId: dailyEntries.participantId })
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.entryDate, clock.today),
        ne(dailyEntries.status, "missing"),
        inArray(
          dailyEntries.participantId,
          people.map((p) => p.id),
        ),
      ),
    );

  const done = new Set(filledToday.map((r) => r.participantId));
  const outstanding = people.filter((p) => !done.has(p.id));
  base.candidates = outstanding.length;

  for (const person of outstanding) {
    try {
      const missed = await getMissedDays(settings, person.id, clock.today);
      const delivery = await sendDailyReminder({
        to: person.email,
        firstName: person.fullName.trim().split(/\s+/)[0] || "there",
        weekNo: clock.currentWeek ?? 1,
        emptyDays: missed.count,
      });
      if (delivery.sent) base.sent += 1;
      else base.failed += 1;
    } catch (error) {
      // One bad address must not stop the rest of the roster being reminded.
      base.failed += 1;
      console.error("[cron] reminder failed for one participant", error);
    }
  }

  base.ran = true;
  return base;
}

async function handle(request: NextRequest) {
  const authorisation = request.headers.get("authorization");
  const provided =
    authorisation?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("secret") ??
    "";

  if (!provided || provided !== env.cronSecret) {
    // No detail, so the endpoint cannot be probed for a valid secret.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await runReminder();
    console.info("[cron] reminder", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron] reminder FAILED", error);
    return NextResponse.json(
      { error: "The reminder job failed", detail: String(error) },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
