import {
  addDays,
  daysBetween,
  formatIsoDateLong,
  weekNoFor,
  type IsoDate,
} from "@/lib/dates";

/**
 * Entry blocks — BCJ's rule for how long a day stays open.
 *
 * The challenge is filled in in blocks of four weeks, and each block gets one
 * extra week to catch up before it shuts for good:
 *
 *   weeks 1–4   caught up during week 5    closed once week 5 ends
 *   weeks 5–8   caught up during week 9    closed once week 9 ends
 *   weeks 9–12  no week 13 to catch up in  closed when an organiser closes
 *                                          the competition
 *
 * So during week 5 a participant may still fill in anything from weeks 1 to 5;
 * the moment week 6 begins, weeks 1 to 4 are final and every day left empty in
 * them scores 0% for good. This replaces the earlier rule, under which any day
 * stayed open until the end of the challenge.
 *
 * The last block has no catch-up week of its own, so it is the one the
 * organisers' "Close the competition" button governs — see participantMayWrite
 * in lib/settings.ts.
 *
 * Pure date arithmetic on purpose: this decides whether somebody's score can
 * still change, so it is worth being able to test without a database.
 */

export const WEEKS_PER_BLOCK = 4;

export interface EntryBlock {
  /** 1-based, in order. */
  index: number;
  firstWeek: number;
  lastWeek: number;
  firstDay: IsoDate;
  lastDay: IsoDate;
  /**
   * The week spent catching this block up, or null when it falls outside the
   * challenge — which is the case for the final block.
   */
  catchUpWeek: number | null;
  /**
   * The last date a participant may still write a day in this block. Null for
   * the final block, whose deadline is the organisers' decision rather than a
   * date.
   */
  closesAfter: IsoDate | null;
  /** "Weeks 1–4", or "Week 12" if a block ever ends up one week long. */
  label: string;
}

/** Every block of a challenge, in order. */
export function entryBlocks(startDate: IsoDate, totalWeeks: number): EntryBlock[] {
  const blocks: EntryBlock[] = [];

  for (let firstWeek = 1; firstWeek <= totalWeeks; firstWeek += WEEKS_PER_BLOCK) {
    const lastWeek = Math.min(firstWeek + WEEKS_PER_BLOCK - 1, totalWeeks);
    const catchUp = lastWeek + 1;
    // A catch-up week that would fall outside the challenge is no catch-up
    // week at all. That is the final block, and it waits for the organisers.
    const catchUpWeek = catchUp <= totalWeeks ? catchUp : null;

    blocks.push({
      index: Math.floor((firstWeek - 1) / WEEKS_PER_BLOCK) + 1,
      firstWeek,
      lastWeek,
      firstDay: addDays(startDate, (firstWeek - 1) * 7),
      lastDay: addDays(startDate, lastWeek * 7 - 1),
      catchUpWeek,
      closesAfter:
        catchUpWeek === null ? null : addDays(startDate, catchUpWeek * 7 - 1),
      label:
        firstWeek === lastWeek
          ? `Week ${firstWeek}`
          : `Weeks ${firstWeek}–${lastWeek}`,
    });
  }

  return blocks;
}

/** The block a week belongs to. */
export function blockForWeek(
  startDate: IsoDate,
  totalWeeks: number,
  weekNo: number,
): EntryBlock | null {
  return (
    entryBlocks(startDate, totalWeeks).find(
      (block) => weekNo >= block.firstWeek && weekNo <= block.lastWeek,
    ) ?? null
  );
}

/** The block a date belongs to, or null if the date is outside the challenge. */
export function blockForDate(
  startDate: IsoDate,
  totalWeeks: number,
  date: IsoDate,
): EntryBlock | null {
  if (daysBetween(startDate, date) < 0) return null;
  return blockForWeek(startDate, totalWeeks, weekNoFor(startDate, date));
}

/**
 * Whether a block has passed its own deadline.
 *
 * A block closes at the *end* of its catch-up week, so it is still open on
 * that last day and shut the morning after.
 */
export function blockIsClosed(block: EntryBlock, today: IsoDate): boolean {
  if (block.closesAfter === null) return false;
  return daysBetween(block.closesAfter, today) > 0;
}

/** Whether this is the week the block is being caught up in — the last chance. */
export function blockIsClosingNow(block: EntryBlock, today: IsoDate): boolean {
  if (block.closesAfter === null) return false;
  // Between the end of the block's own weeks and the end of its catch-up week.
  return (
    daysBetween(block.lastDay, today) > 0 &&
    daysBetween(today, block.closesAfter) >= 0
  );
}

/** Days left to catch a block up, counting today. Zero once it has closed. */
export function daysUntilBlockCloses(
  block: EntryBlock,
  today: IsoDate,
): number | null {
  if (block.closesAfter === null) return null;
  const left = daysBetween(today, block.closesAfter) + 1;
  return left > 0 ? left : 0;
}

/**
 * The blocks that have closed, in order, and the last of them.
 *
 * The nightly job uses this to know how far it may lock: blocks close in
 * order, so locking through the newest closed block's last day covers every
 * earlier one too.
 */
export function closedBlocks(
  startDate: IsoDate,
  totalWeeks: number,
  today: IsoDate,
): EntryBlock[] {
  return entryBlocks(startDate, totalWeeks).filter((block) =>
    blockIsClosed(block, today),
  );
}

/** "Weeks 1–4 closed on Thursday, 23 July 2026" and similar. */
export function describeBlockDeadline(block: EntryBlock): string {
  if (block.closesAfter === null) {
    return `${block.label} stay open until the BCJ organisers close the challenge.`;
  }
  return `${block.label} close after ${formatIsoDateLong(block.closesAfter)}.`;
}
