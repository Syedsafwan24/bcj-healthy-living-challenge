import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { dailyEntries, participants } from "@/db/schema";
import { sendDailyReminder } from "@/lib/email";
import { env } from "@/lib/env";
import { formatIsoDateLong, type IsoDate } from "@/lib/dates";
import {
  blockIsClosingNow,
  daysUntilBlockCloses,
  entryBlocks,
} from "@/lib/entry-blocks";
import { sendPushToParticipants } from "@/lib/push";
import { countEmptyDaysInRange, getMissedDays } from "@/lib/queries";
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
 *
 * During a four-week block's catch-up week it changes its tune. Those days
 * stop being fixable when the deadline passes, so the reminder leads with the
 * deadline and the participant's own count of empty days in that block — the
 * one night it is worth interrupting somebody who is otherwise up to date.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ReminderResult {
  ran: boolean;
  today: string;
  weekNo: number | null;
  candidates: number;
  /** Emails. */
  sent: number;
  failed: number;
  /** Browser notifications, counted per device rather than per person. */
  pushed: number;
  pushFailed: number;
  pushRemoved: number;
  /** The block being caught up, when this is a catch-up week. */
  closingBlock?: string;
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
    pushed: 0,
    pushFailed: 0,
    pushRemoved: 0,
  };

  // Nothing after the last day of week 12. Days stay open into the grace
  // period before an organiser closes the competition, but a nudge to fill in
  // "today" makes no sense once there are no more days to fill in.
  if (!clock.started || clock.weeksOver) {
    return { ...base, message: "The challenge is not running." };
  }

  // Everyone still competing. The email opt-out is applied further down
  // rather than here: it governs email only, and somebody who turned email
  // off but allowed notifications should still get the notification.
  const people = await db
    .select({
      id: participants.id,
      email: participants.email,
      fullName: participants.fullName,
      reminderEmails: participants.reminderEmails,
    })
    .from(participants)
    .where(eq(participants.status, "active"));

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

  // Weeks 1–4 are caught up during week 5, weeks 5–8 during week 9. In one of
  // those weeks the reminder is a deadline warning rather than a nudge.
  const closingBlock =
    entryBlocks(clock.firstDay, settings.totalWeeks).find((block) =>
      blockIsClosingNow(block, clock.today),
    ) ?? null;
  const daysLeft = closingBlock
    ? (daysUntilBlockCloses(closingBlock, clock.today) ?? 0)
    : 0;
  if (closingBlock) base.closingBlock = closingBlock.label;

  if (env.smtpConfigured) {
    for (const person of outstanding.filter((p) => p.reminderEmails)) {
      try {
        const missed = await getMissedDays(settings, person.id, clock.today);
        // Counted per person: a deadline warning that names a number has to
        // name that participant's own number, or it is ignored by the people
        // who are up to date and disbelieved by the people who are not.
        const blockEmpty =
          closingBlock && closingBlock.closesAfter
            ? await countEmptyDaysInRange(
                person.id,
                closingBlock.firstDay,
                closingBlock.lastDay,
                clock.today,
              )
            : 0;

        const delivery = await sendDailyReminder({
          to: person.email,
          firstName: person.fullName.trim().split(/\s+/)[0] || "there",
          weekNo: clock.currentWeek ?? 1,
          emptyDays: missed.count,
          deadline:
            closingBlock && closingBlock.closesAfter
              ? {
                  label: closingBlock.label,
                  closesOn: formatIsoDateLong(
                    closingBlock.closesAfter as IsoDate,
                  ),
                  emptyDays: blockEmpty,
                  daysLeft,
                }
              : undefined,
        });
        if (delivery.sent) base.sent += 1;
        else base.failed += 1;
      } catch (error) {
        // One bad address must not stop the rest of the roster being reminded.
        base.failed += 1;
        console.error("[cron] reminder failed for one participant", error);
      }
    }
  } else {
    base.message = "SMTP is not configured, so no email was sent.";
  }

  // The same nudge to any device that has allowed notifications. It goes to
  // everyone outstanding, including those who turned email off: the two are
  // separate choices, and somebody who wants only the notification should get
  // only the notification. It carries no score, because a notification is
  // readable on a locked screen.
  const push = await sendPushToParticipants(
    outstanding.map((p) => p.id),
    closingBlock && closingBlock.closesAfter
      ? {
          title: `${closingBlock.label} close in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
          // No personal count here: a notification is readable on a locked
          // screen, so it says what is closing and when, and nothing about
          // how far behind this particular person is.
          body: `Fill in any empty days from ${closingBlock.label.toLowerCase()} before ${formatIsoDateLong(closingBlock.closesAfter as IsoDate)}. After that they score 0%.`,
          url: "/app/history",
        }
      : {
          title: "Fill in today",
          body: `Week ${clock.currentWeek ?? 1} — your day is still empty. It takes under a minute.`,
          url: "/app",
        },
  );
  base.pushed = push.sent;
  base.pushFailed = push.failed;
  base.pushRemoved = push.removed;

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
