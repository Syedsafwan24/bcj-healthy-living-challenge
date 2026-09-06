import Link from "next/link";
import { Lock } from "lucide-react";
import type { Metadata } from "next";

import { BlockClosingNotice } from "@/components/block-notice";
import { Button } from "@/components/ui/button";
import { WeeksOverNotice } from "@/components/weeks-over-notice";
import { requireParticipant } from "@/lib/auth/guards";
import {
  datesInWeek,
  formatIsoDate,
  formatIsoDateLong,
  type IsoDate,
} from "@/lib/dates";
import {
  blockIsClosed,
  blockIsClosingNow,
  daysUntilBlockCloses,
  entryBlocks,
  type EntryBlock,
} from "@/lib/entry-blocks";
import { getEntriesBetween, getWeeklyScores } from "@/lib/queries";
import { competitionClock, getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "History", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * `/app/history` — every day of the challenge on one screen.
 *
 * Grouped into the four-week blocks the challenge is actually filled in in,
 * because that is now what decides whether a day can still be changed: weeks
 * 1–4 close a week after they end, then weeks 5–8, and the last block waits
 * for the organisers. A flat list of twelve weeks would show a participant
 * eleven empty days without telling them that six of them are already beyond
 * saving and five are not.
 *
 * Twelve rows of seven still fit on a screen, so any day that is still open is
 * one tap from here.
 */
export default async function HistoryPage() {
  const session = await requireParticipant();
  const settings = await getSettings();
  const clock = competitionClock(settings);

  const [entries, weekly] = await Promise.all([
    getEntriesBetween(session.participantId, clock.firstDay, clock.lastDay),
    getWeeklyScores(session.participantId),
  ]);

  const byDate = new Map(entries.map((e) => [e.entryDate, e]));
  const byWeek = new Map(weekly.map((w) => [w.weekNo, w]));

  const blocks = entryBlocks(clock.firstDay, settings.totalWeeks);

  const isEmpty = (date: string) => {
    const entry = byDate.get(date);
    return !entry || entry.status === "missing";
  };

  // Days still worth chasing: empty, already past, and in a block that has not
  // closed. Days in a closed block are counted separately — telling somebody
  // to go and fill in a day they can no longer touch is worse than saying
  // nothing.
  const stillOpen: IsoDate[] = [];
  let lostToClosedBlocks = 0;

  for (const block of blocks) {
    const closed = clock.closed || blockIsClosed(block, clock.today);
    for (let weekNo = block.firstWeek; weekNo <= block.lastWeek; weekNo += 1) {
      for (const date of datesInWeek(clock.firstDay, weekNo)) {
        if (date >= clock.today || !isEmpty(date)) continue;
        if (closed) lostToClosedBlocks += 1;
        else stillOpen.push(date as IsoDate);
      }
    }
  }

  const closingBlock =
    blocks.find((block) => blockIsClosingNow(block, clock.today)) ?? null;
  const closingBlockEmpty = closingBlock
    ? stillOpen.filter(
        (date) => date >= closingBlock.firstDay && date <= closingBlock.lastDay,
      ).length
    : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          My days
        </h1>
        <p className="text-muted-foreground">
          Tap any day that is still open to fill it in or change it.
        </p>
      </header>

      {clock.weeksOver && !clock.closed && (
        <WeeksOverNotice lastDay={clock.lastDay} />
      )}

      {closingBlock && !clock.closed && (
        <BlockClosingNotice
          block={closingBlock}
          emptyDays={closingBlockEmpty}
          daysLeft={daysUntilBlockCloses(closingBlock, clock.today) ?? 0}
        />
      )}

      {stillOpen.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-50/60 p-4 dark:bg-amber-950/20">
          <p className="text-sm">
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {stillOpen.length} day{stillOpen.length === 1 ? "" : "s"} you can
              still fill in.
            </span>{" "}
            Each one scores 0% until you do.
          </p>
          <Button asChild size="sm" variant="outline" className="h-11">
            <Link href={`/app?date=${stillOpen[stillOpen.length - 1]}`}>
              Fill in the most recent
            </Link>
          </Button>
        </div>
      )}

      {lostToClosedBlocks > 0 && (
        <p className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          {lostToClosedBlocks} earlier day
          {lostToClosedBlocks === 1 ? " is" : "s are"} in a block that has
          already closed, so {lostToClosedBlocks === 1 ? "it scores" : "they score"}{" "}
          0% and can no longer be changed here. Speak to a BCJ organiser if
          something there is wrong.
        </p>
      )}

      {/* ---- legend, so the colours need no explaining ---- */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-green-600" />
          Filled in
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-amber-400" />
          Empty
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded ring-2 ring-primary ring-offset-1" />
          Today
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded bg-muted" />
          Not yet
        </span>
      </div>

      {/* ---- every block, every week, every day ---- */}
      <div className="space-y-4">
        {blocks.map((block) => {
          const closed = clock.closed || blockIsClosed(block, clock.today);
          const weeks = Array.from(
            { length: block.lastWeek - block.firstWeek + 1 },
            (_, i) => block.firstWeek + i,
          );

          return (
            <section
              key={block.index}
              className={cn(
                "overflow-hidden rounded-xl border bg-card",
                closed && "opacity-75",
              )}
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {closed && <Lock className="size-3.5" />}
                  {block.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  <BlockState
                    block={block}
                    closed={closed}
                    competitionClosed={clock.closed}
                    today={clock.today}
                  />
                </p>
              </header>

              {weeks.map((weekNo) => {
                const dates = datesInWeek(clock.firstDay, weekNo);
                const score = byWeek.get(weekNo);
                const started = dates[0] <= clock.today;

                return (
                  <div
                    key={weekNo}
                    className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center"
                  >
                    <div className="w-28 shrink-0">
                      <p className="text-sm font-medium">Week {weekNo}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {started
                          ? `${Number(score?.percentage ?? 0).toFixed(1)}%`
                          : "Not yet"}
                      </p>
                    </div>

                    <div className="flex flex-1 flex-wrap gap-2">
                      {dates.map((date) => (
                        <DayCell
                          key={date}
                          date={date as IsoDate}
                          entry={byDate.get(date) ?? null}
                          today={clock.today}
                          blockClosed={closed}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        The challenge is filled in four weeks at a time, and each block gets one
        further week to catch up before it closes for good. The last block stays
        open until the BCJ organisers close the challenge. After a block closes
        an organiser can still correct a day for you, and every change is
        recorded.
      </p>
    </div>
  );
}

/** One line saying where a block stands. */
function BlockState({
  block,
  closed,
  competitionClosed,
  today,
}: {
  block: EntryBlock;
  closed: boolean;
  competitionClosed: boolean;
  today: IsoDate;
}) {
  if (closed) {
    if (block.closesAfter) {
      return <>Closed {formatIsoDate(block.closesAfter)}</>;
    }
    return <>Closed by the organisers</>;
  }

  if (!block.closesAfter) {
    return competitionClosed ? (
      <>Closed by the organisers</>
    ) : (
      <>Open until the organisers close the challenge</>
    );
  }

  const left = daysUntilBlockCloses(block, today) ?? 0;
  if (blockIsClosingNow(block, today)) {
    return (
      <span className="font-medium text-amber-700 dark:text-amber-400">
        Last chance — closes in {left} day{left === 1 ? "" : "s"}
      </span>
    );
  }

  return <>Open until {formatIsoDateLong(block.closesAfter)}</>;
}

/**
 * One day. A link when its block is still open, a plain box when it is not, so
 * a day that cannot be changed never looks tappable.
 */
function DayCell({
  date,
  entry,
  today,
  blockClosed,
}: {
  date: IsoDate;
  entry: { status: string; dailyPercentage: string | null } | null;
  today: IsoDate;
  blockClosed: boolean;
}) {
  const dayNumber = Number(date.slice(8, 10));
  const isToday = date === today;
  const future = date > today;
  const filled = entry !== null && entry.status !== "missing";

  const base =
    "relative flex size-11 shrink-0 flex-col items-center justify-center rounded-lg text-sm font-medium tabular";

  if (future) {
    return (
      <span
        className={cn(base, "bg-muted text-muted-foreground/60")}
        aria-label={`${formatIsoDateLong(date)}: not yet`}
      >
        {dayNumber}
      </span>
    );
  }

  const tone = filled
    ? "bg-green-600 text-white"
    : "bg-amber-400 text-amber-950";

  const label = `${formatIsoDateLong(date)}: ${
    filled
      ? `${Number(entry?.dailyPercentage ?? 0).toFixed(0)} per cent`
      : "nothing filled in"
  }${isToday ? ", today" : ""}${blockClosed ? ", closed" : ""}`;

  const cell = (
    <span
      className={cn(
        base,
        tone,
        isToday && "ring-2 ring-primary ring-offset-2",
        blockClosed && "opacity-60",
        !blockClosed && (filled ? "hover:bg-green-700" : "hover:bg-amber-500"),
      )}
      aria-label={blockClosed ? label : undefined}
    >
      {dayNumber}
      {blockClosed && <Lock className="absolute right-0.5 top-0.5 size-2.5" />}
    </span>
  );

  if (blockClosed) return cell;

  return (
    <Link href={`/app?date=${date}`} aria-label={label} title={label}>
      {cell}
    </Link>
  );
}
