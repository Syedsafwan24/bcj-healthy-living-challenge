/**
 * Date helpers.
 *
 * Entry dates are plain calendar dates in the competition timezone
 * (settings.timezone, default Asia/Riyadh) and are handled as `YYYY-MM-DD`
 * strings throughout. Nothing in scoring reads a Date object's local
 * components, so the server's own timezone never affects a score.
 */

export type IsoDate = string; // 'YYYY-MM-DD'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): value is IsoDate {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function assertIsoDate(value: string): void {
  if (!isIsoDate(value)) throw new Error(`Not a YYYY-MM-DD date: ${value}`);
}

/** Midnight UTC for a calendar date, used only for whole-day arithmetic. */
function toUtcMs(date: IsoDate): number {
  assertIsoDate(date);
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/**
 * Competition week for an entry date — specification section 4.1.
 *
 *   weekNo = floor(daysBetween(startDate, entryDate) / 7) + 1
 *
 * The result is derived only from the two dates. It never reads the clock,
 * which is what keeps a late correction scored against the entry's own week
 * (section 4.2, test vector T9).
 */
export function weekNoFor(startDate: IsoDate, entryDate: IsoDate): number {
  return Math.floor(daysBetween(startDate, entryDate) / 7) + 1;
}

/** First and last scorable dates: startDate through startDate + (totalWeeks * 7 - 1). */
export function competitionRange(
  startDate: IsoDate,
  totalWeeks: number,
): { first: IsoDate; last: IsoDate; days: number } {
  const days = totalWeeks * 7;
  return { first: startDate, last: addDays(startDate, days - 1), days };
}

/** A date is scorable when it falls inside the competition window. */
export function isScorableDate(
  startDate: IsoDate,
  totalWeeks: number,
  entryDate: IsoDate,
): boolean {
  if (!isIsoDate(entryDate)) return false;
  const offset = daysBetween(startDate, entryDate);
  return offset >= 0 && offset < totalWeeks * 7;
}

/** Every date in a competition week, Monday-agnostic: week 1 starts on startDate. */
export function datesInWeek(startDate: IsoDate, weekNo: number): IsoDate[] {
  const first = addDays(startDate, (weekNo - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/* ------------------------------------------------------------------ */
/* Clock reads, in the competition timezone                            */
/* ------------------------------------------------------------------ */

/** Today's calendar date in the given IANA timezone. */
export function todayInZone(timezone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Minutes since midnight in the given timezone. */
export function minutesIntoDayInZone(
  timezone: string,
  now: Date = new Date(),
): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [h, m] = fmt.split(":").map(Number);
  return h * 60 + m;
}

/** A `time` column reads back as 'HH:MM:SS'. Deadlines are shown as 'HH:MM'. */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

/** Parses a 'HH:MM' or 'HH:MM:SS' settings time into minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

export function formatIsoDate(date: IsoDate, timezone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formatIsoDateLong(date: IsoDate): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formatDateTime(value: Date, timezone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
