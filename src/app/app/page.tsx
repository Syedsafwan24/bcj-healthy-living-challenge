import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock, Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { DailyEntryForm, EMPTY_FORM, type DailyFormValues } from "@/components/daily-entry-form";
import { DayStrip } from "@/components/day-strip";
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
  getEntriesBetween,
  getEntry,
  getFinalScore,
  getMissedDays,
  getParticipantProfile,
  getWeeklyScores,
} from "@/lib/queries";
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

  if (clock.finished) {
    return (
      <NotRunning
        title="The challenge has finished"
        body={`The last scorable day was ${formatIsoDateLong(clock.lastDay)}. Your final score is on the progress page.`}
        cta={{ href: "/app/progress", label: "See my final score" }}
      />
    );
  }

  // A participant may open an earlier day from the history screen. The date
  // is validated against the competition window and the correction rules
  // below, so an arbitrary query string cannot open a locked day.
  const entryDate = (params.date ?? clock.today) as IsoDate;
  const permission = participantMayWrite(settings, entryDate);
  // Derived from the entry's own date, never from today (section 4.2).
  const weekNo = weekNoFor(clock.firstDay, entryDate);

  const [entry, profile, weekly, final, missed, recent] = await Promise.all([
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
  const alreadySubmitted =
    entry !== null && entry.status !== "missing" && entry.submittedAt !== null;

  const thisWeek = weekly.find((w) => w.weekNo === weekNo);
  const isToday = entryDate === clock.today;

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
          {profile?.dietTitle && (
            <Badge variant="outline" className="rounded-full">
              {profile.dietTitle}
            </Badge>
          )}
          {!isToday && (
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
          {!isToday && (
            <Button asChild variant="outline" size="sm" className="h-11">
              <Link href="/app">Back to today</Link>
            </Button>
          )}
        </div>
      </header>

      <DayStrip
        week={stripWeek}
        weekNo={weekNo}
        totalWeeks={settings.totalWeeks}
        today={clock.today}
        current={entryDate}
        filled={filledDates}
      />

      {/* ---- days left behind ----
          Shown only on today's screen, and only about days already past.
          Today is never counted as missed: the day is not over, and telling
          someone they have missed a day they are looking at would be wrong.
          Because any day stays open until the challenge ends, this is an
          invitation to go back rather than a reprimand. */}
      {isToday && missed.count > 0 && (
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
                  }. Those days score 0% until you fill them in, and you can still do that any time before the challenge ends.`
                : "Those days score 0% until you fill them in, and you can still do that any time before the challenge ends."}
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
          permission.allowed
            ? undefined
            : refusalMessage(permission.reason!, settings)
        }
        correctionClosesAfter={permission.correctionClosesAfter}
        alreadySubmitted={alreadySubmitted}
      />

      <DailyEntryForm
        entryDate={entryDate}
        settings={toScoringSettings(settings)}
        activeChallenges={activeChallenges}
        initialValues={initialValues}
        readOnly={readOnly}
        readOnlyReason={
          entry?.status === "locked"
            ? "This day is locked. Ask a BCJ organiser if it needs correcting."
            : permission.allowed
              ? undefined
              : refusalMessage(permission.reason!, settings)
        }
        alreadySubmitted={alreadySubmitted}
        weekNo={weekNo}
        isRepeatPhase={isRepeatPhase}
        dietPlanNote={
          profile?.dietTitle
            ? `Five points for each meal you followed your ${profile.dietTitle} plan.`
            : undefined
        }
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
  correctionClosesAfter,
  alreadySubmitted,
}: {
  status: string;
  allowed: boolean;
  message?: string;
  correctionClosesAfter?: IsoDate;
  alreadySubmitted: boolean;
}) {
  if (status === "locked") {
    return (
      <Alert>
        <Lock className="size-4" />
        <AlertTitle>Locked</AlertTitle>
        <AlertDescription>
          The 12 weeks are over, so this day is now final. Only a BCJ organiser
          can change it.
        </AlertDescription>
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
        <AlertDescription>
          You can still change this day until the end of the challenge on{" "}
          {correctionClosesAfter
            ? formatIsoDateLong(correctionClosesAfter)
            : "the last day of week 12"}
          .
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <Clock className="size-4" />
      <AlertTitle>Not filled in yet</AlertTitle>
      <AlertDescription>
        A day you never fill in scores 0%. You can come back to it any time
        before the challenge ends.
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
