import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatIsoDate, type IsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * The week the open day belongs to, with a way to step to the week either
 * side of it.
 *
 * Reaching an earlier day used to mean leaving for the history screen. This
 * puts a whole week on the day screen and lets you walk backwards through the
 * challenge without going anywhere, which is the correction people actually
 * make — a day or two, occasionally a week, behind.
 */
export function DayStrip({
  week,
  weekNo,
  totalWeeks,
  today,
  current,
  filled,
}: {
  /** The seven dates of the week being shown, in order. */
  week: readonly IsoDate[];
  weekNo: number;
  totalWeeks: number;
  today: IsoDate;
  /** The day being viewed, which may not be today. */
  current: IsoDate;
  /** Dates in this week that have something recorded. */
  filled: ReadonlySet<string>;
}) {
  const previousWeek = weekNo > 1 ? week[0] : null;
  const nextWeek = weekNo < totalWeeks ? week[6] : null;

  return (
    <section className="rounded-xl border bg-card">
      {/* ---- which week ---- */}
      <div className="flex items-center justify-between gap-2 border-b px-2 py-2">
        <WeekArrow
          to={previousWeek}
          direction="back"
          label={`Week ${weekNo - 1}`}
        />

        <div className="text-center">
          <p className="text-sm font-medium">
            Week {weekNo} of {totalWeeks}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatIsoDate(week[0])} – {formatIsoDate(week[6])}
          </p>
        </div>

        <WeekArrow to={nextWeek} direction="forward" label={`Week ${weekNo + 1}`} />
      </div>

      {/* ---- the seven days ---- */}
      <div className="grid grid-cols-7 gap-1 p-2">
        {week.map((date) => (
          <Day
            key={date}
            date={date}
            today={today}
            current={current}
            done={filled.has(date)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Steps a week. The first date of the target week is enough: the day screen
 * derives the week from whatever date it is given, so this lands on the
 * Monday of the previous week and the Sunday of the next — in both cases the
 * day nearest the one just left.
 */
function WeekArrow({
  to,
  direction,
  label,
}: {
  to: IsoDate | null;
  direction: "back" | "forward";
  label: string;
}) {
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;
  const offset = direction === "back" ? -1 : 1;

  if (!to) {
    return <span className="size-11 shrink-0" aria-hidden />;
  }

  return (
    <Link
      href={`/app?date=${shift(to, offset)}`}
      aria-label={label}
      title={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-5" />
    </Link>
  );
}

/** One day forward or back, as an ISO date. */
function shift(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) as IsoDate;
}

function Day({
  date,
  today,
  current,
  done,
}: {
  date: IsoDate;
  today: IsoDate;
  current: IsoDate;
  done: boolean;
}) {
  const isToday = date === today;
  const isCurrent = date === current;
  const future = date > today;

  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00Z`));
  const dayNumber = Number(date.slice(8, 10));

  const inner = (
    <>
      <span className="text-[11px] leading-none text-muted-foreground">
        {weekday}
      </span>
      <span className="tabular text-base leading-none font-semibold">
        {dayNumber}
      </span>
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          future
            ? "bg-transparent"
            : done
              ? "bg-green-600"
              : "bg-amber-400",
        )}
      />
    </>
  );

  const shell =
    "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg py-2 transition-colors";

  if (future) {
    return (
      <span
        className={cn(shell, "text-muted-foreground/50")}
        aria-label={`${weekday} ${dayNumber}: not yet`}
      >
        {inner}
      </span>
    );
  }

  return (
    <Link
      href={`/app?date=${date}`}
      aria-current={isCurrent ? "page" : undefined}
      aria-label={`${weekday} ${dayNumber}${isToday ? ", today" : ""}: ${
        done ? "filled in" : "nothing filled in"
      }`}
      className={cn(
        shell,
        isCurrent
          ? "bg-secondary ring-2 ring-inset ring-primary"
          : "hover:bg-muted",
        !isCurrent && isToday && "ring-1 ring-inset ring-border",
      )}
    >
      {inner}
    </Link>
  );
}
