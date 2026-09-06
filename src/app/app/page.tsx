import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock, Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { DailyEntryForm, EMPTY_FORM, type DailyFormValues } from "@/components/daily-entry-form";
import { DayStrip } from "@/components/day-strip";
import { BlockClosingNotice } from "@/components/block-notice";
import { WeeksOverNotice } from "@/components/weeks-over-notice";
import type { TriState } from "@/components/entry-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireParticipant } from "@/lib/auth/guards";
import {
  datesInWeek,
  formatIsoDateLong,
  weekNoFor,
  type IsoDate,
} from "@/lib/dates";
import {
  countEmptyDaysInRange,
  getEntriesBetween,
  getEntry,
  getFinalScore,
  getMissedDays,
  getParticipantProfile,
  getWeeklyScores,
} from "@/lib/queries";
import {
  blockIsClosed,
  blockIsClosingNow,
  daysUntilBlockCloses,
  entryBlocks,
} from "@/lib/entry-blocks";
import { activeChallengesForWeek } from "@/lib/scoring";
import {
  competitionClock,
  getSettings,
  participantMayWrite,
  refusalMessage,
  toScoringSettings,
} from "@/lib/settings";

export const metadata: Metadata = { title: "Today", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * `/app` — today. Follows V6 section 6: profile and approved diet category,
 * current challenge week, all active lifestyle challenges, the water, steps
 * and sleep inputs, the Yes/No behaviour inputs, the two diet inputs, the
 * automatic daily score with maximum and percentage, weekly progress, final
 * score and submission status.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireParticipant();
  const settings = await getSettings();
  const clock = competitionClock(settings);
  const params = await searchParams;

  /* ---- before or after the competition ---- */
  if (!clock.started) {
    return (
      <NotRunning
        title="The challenge has not started yet"
        body={`Week 1 begins on ${formatIsoDateLong(clock.firstDay)}. You can fill in your first day that morning.`}
      />
    );
  }

  // Only the organisers closing it ends the challenge. Between the last day
  // of week 12 and that decision the days stay open, so anyone behind can fill
  // in what they missed — see participantMayWrite.
  if (clock.closed) {
    return (
      <NotRunning
        title="The challenge is closed"
        body={`The last scorable day was ${formatIsoDateLong(clock.lastDay)}, and the organisers have made the results final. Your final score is on the progress page.`}
        cta={{ href: "/app/progress", label: "See my final score" }}
      />
    );
  }

  // The day this screen opens on with no date asked for. Once the 12 weeks are
  // over there is no "today" inside the challenge, so it lands on the last day
  // rather than on a date the competition never covered.
  const landingDate = clock.weeksOver ? clock.lastDay : clock.today;

  // A participant may open an earlier day from the history screen. The date
  // is validated against the competition window and the correction rules
  // below, so an arbitrary query string cannot open a locked day.
  const entryDate = (params.date ?? landingDate) as IsoDate;
  const permission = participantMayWrite(settings, entryDate);
  // Derived from the entry's own date, never from today (section 4.2).
  const weekNo = weekNoFor(clock.firstDay, entryDate);

  // The four-week block being caught up right now, if any. Weeks 1–4 are
  // caught up during week 5, weeks 5–8 during week 9, and after that block's
  // last day every empty day in it scores 0% for good — so this warning is
  // the only one anybody gets.
  const closingBlock =
    entryBlocks(clock.firstDay, settings.totalWeeks).find((block) =>
      blockIsClosingNow(block, clock.today),
    ) ?? null;

  const [entry, profile, weekly, final, missed, recent, blockEmptyDays] =
    await Promise.all([
      getEntry(session.participantId, entryDate),
      getParticipantProfile(session.participantId),
      getWeeklyScores(session.participantId),
      getFinalScore(session.participantId),
      getMissedDays(settings, session.participantId, clock.today),
      // Only the week on screen, so the day screen still runs one small set of
      // queries rather than reading the whole challenge.
      getEntriesBetween(
        session.participantId,
        datesInWeek(clock.firstDay, weekNo)[0],
        datesInWeek(clock.firstDay, weekNo)[6],
      ),
      // Only asked for during a catch-up week, and only about that block.
      closingBlock
        ? countEmptyDaysInRange(
            session.participantId,
            closingBlock.firstDay,
            closingBlock.lastDay,
            clock.today,
          )
        : Promise.resolve(0),
    ]);

  const stripWeek = datesInWeek(clock.firstDay, weekNo);
  const filledDates = new Set(
    recent.filter((e) => e.status !== "missing").map((e) => e.entryDate),
  );

  const activeChallenges = activeChallengesForWeek(weekNo, settings.maxActiveWeek);
  const isRepeatPhase = weekNo > settings.maxActiveWeek;

  const initialValues: DailyFormValues = entry
    ? {
        waterLitres: entry.waterLitres ?? "",
        steps: entry.steps === null ? "" : String(entry.steps),
        sleepHours: entry.sleepHours ?? "",
        c3CookAtHome: tri(entry.c3CookAtHome),
        c4NoSugary: tri(entry.c4NoSugary),
        c5Vegetables: tri(entry.c5Vegetables),
        c5VegetablesDinner: tri(entry.c5VegetablesDinner),
        c6NoLateFood: tri(entry.c6NoLateFood),
        c8Mindfulness: tri(entry.c8Mindfulness),
        c9ScreenTime: tri(entry.c9ScreenTime),
        breakfast: tri(entry.breakfast),
        midMorning: tri(entry.midMorning),
        lunch: tri(entry.lunch),
        eveningSnack: tri(entry.eveningSnack),
        dinner: tri(entry.dinner),
      }
    : // Nothing is pre-filled from the previous day — section 9.5.
      EMPTY_FORM;

  const readOnly = !permission.allowed || entry?.status === "locked";

  // Why this day is final, said in the terms that actually apply: a block
  // that passed its own catch-up deadline, or the whole competition being
  // closed. "This is locked" without saying which and when is the kind of
  // message people bring to an organiser.
  const block = permission.block;
  const lockedReason = clock.closed
    ? "The organisers have closed the challenge, so this day is final. Only a BCJ organiser can change it now."
    : block?.closesAfter
      ? `${block.label} closed after ${formatIsoDateLong(block.closesAfter)}, so this day is final. Only a BCJ organiser can change it now.`
      : "This day is final. Only a BCJ organiser can change it now.";

  // The same fact in four words, for the notice that sits down beside the
  // controls. The banner above the score already gives the full explanation,
  // and printing it twice on one screen reads as a glitch.
  const formNotice = !permission.allowed
    ? permission.reason === "block_closed" && block
      ? `${block.label} are closed.`
      : permission.reason === "competition_closed"
        ? "The challenge is closed."
        : permission.reason === "future_date"
          ? "This day has not happened yet."
          : "This day cannot be filled in."
    : lockedReason;

  // And how long is left on a day that is still open.
  const stillOpenUntil = block?.closesAfter
    ? `You can change this day until ${formatIsoDateLong(block.closesAfter)}, when ${block.label.toLowerCase()} close.`
    : "You can change this day until the organisers close the challenge.";
  const alreadySubmitted =
    entry !== null && entry.status !== "missing" && entry.submittedAt !== null;

  const thisWeek = weekly.find((w) => w.weekNo === weekNo);
  const isToday = entryDate === clock.today;
  // Whether this is the screen a participant arrives on. During the 12 weeks
  // that is today; afterwards it is the last day of the challenge.
  const isLanding = entryDate === landingDate;

  // The name people actually go by. Falls back to the display name, and then
  // to nothing at all rather than greeting somebody as "undefined".
  const firstName =
    profile?.fullName?.trim().split(/\s+/)[0] || profile?.displayName?.trim() || "";

  return (
    <div className="space-y-6">
      {/* ---- header ---- */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full">
            Week {weekNo} of {settings.totalWeeks}
          </Badge>
          {!isToday && !clock.weeksOver && (
            <Badge variant="outline" className="rounded-full">
              Earlier day
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {isToday
                ? firstName
                  ? `Welcome back, ${firstName}`
                  : "Today"
                : formatIsoDateLong(entryDate)}
            </h1>
            {isToday && (
              <p className="mt-1 text-sm text-muted-foreground">
                {formatIsoDateLong(entryDate)}
              </p>
            )}
          </div>
          {!isLanding && (
            <Button asChild variant="outline" size="sm" className="h-11">
              <Link href="/app">
                {clock.weeksOver ? "Back to the last day" : "Back to today"}
              </Link>
            </Button>
          )}
        </div>
      </header>

      {clock.weeksOver && <WeeksOverNotice lastDay={clock.lastDay} />}

      {closingBlock && (
        <BlockClosingNotice
          block={closingBlock}
          emptyDays={blockEmptyDays}
          daysLeft={daysUntilBlockCloses(closingBlock, clock.today) ?? 0}
        />
      )}

      <DayStrip
        week={stripWeek}
        weekNo={weekNo}
        totalWeeks={settings.totalWeeks}
        today={clock.today}
        current={entryDate}
        filled={filledDates}
        blockClosed={
          clock.closed || (block ? blockIsClosed(block, clock.today) : false)
        }
      />

      {/* ---- days left behind ----
          Shown only on today's screen, and only about days already past.
          Today is never counted as missed: the day is not over, and telling
          someone they have missed a day they are looking at would be wrong.
          Because a day stays open until its own block closes, this is an
          invitation to go back rather than a reprimand — and a deadline. */}
      {/* Not while a block deadline is on screen: that banner is the same
          message with a date attached, and two amber boxes saying "you are
          behind" is one more than anybody reads. */}
      {isLanding && !closingBlock && missed.count > 0 && (
        <Alert>
          <CalendarClock className="size-4" />
          <AlertTitle>
            {missed.count === 1
              ? "One day is still empty"
              : `${missed.count} days are still empty`}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {missed.lastMissed
                ? `You have nothing recorded for ${formatIsoDateLong(missed.lastMissed)}${
                    missed.count > 1 ? ", and earlier days too" : ""
                  }. Those days score 0% until you fill them in, and each block of four weeks closes for good a week after it ends.`
                : "Those days score 0% until you fill them in, and each block of four weeks closes for good a week after it ends."}
            </p>
            <div className="flex flex-wrap gap-2">
              {missed.lastMissed && (
                <Button asChild size="sm" variant="outline" className="h-11">
                  <Link href={`/app?date=${missed.lastMissed}`}>
                    Fill in {formatIsoDateLong(missed.lastMissed)}
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant="ghost" className="h-11">
                <Link href="/app/history">See all my days</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* ---- submission status banner — section 9.5 ---- */}
      <SubmissionBanner
        status={entry?.status ?? "draft"}
        allowed={permission.allowed}
        message={
          permission.allowed ? undefined : refusalMessage(permission, settings)
        }
        lockedReason={lockedReason}
        stillOpenUntil={stillOpenUntil}
        weeksOver={clock.weeksOver}
        alreadySubmitted={alreadySubmitted}
      />

      <DailyEntryForm
        entryDate={entryDate}
        settings={toScoringSettings(settings)}
        activeChallenges={activeChallenges}
        initialValues={initialValues}
        readOnly={readOnly}
        readOnlyReason={formNotice}
        alreadySubmitted={alreadySubmitted}
        weekNo={weekNo}
        isRepeatPhase={isRepeatPhase}
      />

      {/* ---- weekly progress and final score, V6 section 6 ---- */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-sm text-muted-foreground">This week so far</p>
            <p className="tabular text-3xl font-semibold">
              {Number(thisWeek?.percentage ?? 0).toFixed(1)}
              <span className="text-lg font-medium text-muted-foreground">%</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Average of week {weekNo}&apos;s seven daily percentages.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-sm text-muted-foreground">Final score to date</p>
            <p className="tabular text-3xl font-semibold">
              {Number(final?.finalScore ?? 0).toFixed(1)}
              <span className="text-lg font-medium text-muted-foreground">
                {" "}
                / {settings.totalWeeks * 100}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              <Link
                href="/app/progress"
                className="underline-offset-4 hover:underline"
              >
                See every week
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function tri(value: boolean | null): TriState {
  return value === true ? "yes" : value === false ? "no" : "";
}

function SubmissionBanner({
  status,
  allowed,
  message,
  lockedReason,
  stillOpenUntil,
  weeksOver,
  alreadySubmitted,
}: {
  status: string;
  allowed: boolean;
  message?: string;
  lockedReason: string;
  stillOpenUntil: string;
  weeksOver: boolean;
  alreadySubmitted: boolean;
}) {
  if (status === "locked") {
    return (
      <Alert>
        <Lock className="size-4" />
        <AlertTitle>Locked</AlertTitle>
        <AlertDescription>{lockedReason}</AlertDescription>
      </Alert>
    );
  }

  if (!allowed) {
    return (
      <Alert variant="destructive">
        <TriangleAlert className="size-4" />
        <AlertTitle>Closed for changes</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  if (alreadySubmitted) {
    return (
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertTitle>Saved</AlertTitle>
        <AlertDescription>{stillOpenUntil}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <Clock className="size-4" />
      <AlertTitle>Not filled in yet</AlertTitle>
      <AlertDescription>
        {weeksOver
          ? `A day you never fill in scores 0%. The 12 weeks are over, so fill this one in before the organisers close the challenge.`
          : `A day you never fill in scores 0%. ${stillOpenUntil}`}
      </AlertDescription>
    </Alert>
  );
}

function NotRunning({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto mb-5 inline-flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <CalendarClock className="size-6" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">{body}</p>
      {cta && (
        <Button asChild size="lg" className="mt-7 h-12">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      )}
    </div>
  );
}
