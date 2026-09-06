import { describe, expect, it } from "vitest";

import {
  blockForDate,
  blockForWeek,
  blockIsClosed,
  blockIsClosingNow,
  closedBlocks,
  daysUntilBlockCloses,
  entryBlocks,
} from "@/lib/entry-blocks";
import type { IsoDate } from "@/lib/dates";

/**
 * The four-week block deadlines.
 *
 * These decide the moment somebody's score stops being able to change, so the
 * arithmetic is worth pinning down against dates written out by hand rather
 * than against itself. BCJ's season starts on Friday 19 June 2026:
 *
 *   weeks 1–4    19 Jun – 16 Jul   caught up in week 5, closed after 23 Jul
 *   weeks 5–8    17 Jul – 13 Aug   caught up in week 9, closed after 20 Aug
 *   weeks 9–12   14 Aug – 10 Sep   no week 13, so the organisers close it
 *
 * The off-by-one at each boundary is the thing that actually costs someone
 * their points: a block is open on its closing date and shut the morning
 * after, and it must not shut a day early.
 */

const START = "2026-06-19" as IsoDate;
const WEEKS = 12;

describe("entryBlocks", () => {
  it("splits a 12-week challenge into three blocks with the dates BCJ expects", () => {
    const blocks = entryBlocks(START, WEEKS);
    expect(blocks).toHaveLength(3);

    expect(blocks[0]).toMatchObject({
      firstWeek: 1,
      lastWeek: 4,
      firstDay: "2026-06-19",
      lastDay: "2026-07-16",
      catchUpWeek: 5,
      closesAfter: "2026-07-23",
      label: "Weeks 1–4",
    });

    expect(blocks[1]).toMatchObject({
      firstWeek: 5,
      lastWeek: 8,
      firstDay: "2026-07-17",
      lastDay: "2026-08-13",
      catchUpWeek: 9,
      closesAfter: "2026-08-20",
    });

    // The last block has no week 13 to be caught up in, so it has no date of
    // its own — the organisers' "Close the competition" governs it.
    expect(blocks[2]).toMatchObject({
      firstWeek: 9,
      lastWeek: 12,
      firstDay: "2026-08-14",
      lastDay: "2026-09-10",
      catchUpWeek: null,
      closesAfter: null,
    });
  });

  it("handles a challenge whose length is not a multiple of four", () => {
    const blocks = entryBlocks(START, 10);
    expect(blocks.map((b) => [b.firstWeek, b.lastWeek])).toEqual([
      [1, 4],
      [5, 8],
      [9, 10],
    ]);
    // Weeks 5–8 would be caught up in week 9, which exists in a 10-week
    // challenge, so that deadline still stands.
    expect(blocks[1].closesAfter).toBe("2026-08-20");
    // The short final block has nowhere to catch up.
    expect(blocks[2].closesAfter).toBeNull();
    expect(blocks[2].label).toBe("Weeks 9–10");
  });
});

describe("which block a day belongs to", () => {
  it("maps the boundary days to the right block", () => {
    // Last day of week 4 and first day of week 5, either side of the seam.
    expect(blockForDate(START, WEEKS, "2026-07-16" as IsoDate)?.index).toBe(1);
    expect(blockForDate(START, WEEKS, "2026-07-17" as IsoDate)?.index).toBe(2);
    expect(blockForDate(START, WEEKS, "2026-08-13" as IsoDate)?.index).toBe(2);
    expect(blockForDate(START, WEEKS, "2026-08-14" as IsoDate)?.index).toBe(3);
  });

  it("has nothing for a day before the challenge", () => {
    expect(blockForDate(START, WEEKS, "2026-06-18" as IsoDate)).toBeNull();
  });

  it("maps weeks to blocks", () => {
    expect(blockForWeek(START, WEEKS, 4)?.index).toBe(1);
    expect(blockForWeek(START, WEEKS, 5)?.index).toBe(2);
    expect(blockForWeek(START, WEEKS, 13)).toBeNull();
  });
});

describe("blockIsClosed", () => {
  const [first, second, last] = entryBlocks(START, WEEKS);

  it("stays open for the whole of the catch-up week", () => {
    // Week 5 runs 17–23 July. Every one of those days is still writable.
    expect(blockIsClosed(first, "2026-07-17" as IsoDate)).toBe(false);
    expect(blockIsClosed(first, "2026-07-22" as IsoDate)).toBe(false);
    // The closing date itself is the last day, not the first day shut.
    expect(blockIsClosed(first, "2026-07-23" as IsoDate)).toBe(false);
  });

  it("shuts the morning after its closing date", () => {
    expect(blockIsClosed(first, "2026-07-24" as IsoDate)).toBe(true);
    expect(blockIsClosed(first, "2026-09-01" as IsoDate)).toBe(true);
  });

  it("does not shut one block when another does", () => {
    // Week 6. Weeks 1–4 are gone; weeks 5–8 have not even finished.
    const inWeek6 = "2026-07-27" as IsoDate;
    expect(blockIsClosed(first, inWeek6)).toBe(true);
    expect(blockIsClosed(second, inWeek6)).toBe(false);
  });

  it("never shuts the final block on a date", () => {
    // Long after the challenge ended. Only an organiser closes this one.
    expect(blockIsClosed(last, "2027-01-01" as IsoDate)).toBe(false);
  });
});

describe("blockIsClosingNow", () => {
  const [first, second, last] = entryBlocks(START, WEEKS);

  it("is true only during the catch-up week", () => {
    // Week 4, the block's own last week: not yet the catch-up week.
    expect(blockIsClosingNow(first, "2026-07-16" as IsoDate)).toBe(false);
    // Week 5, start and end.
    expect(blockIsClosingNow(first, "2026-07-17" as IsoDate)).toBe(true);
    expect(blockIsClosingNow(first, "2026-07-23" as IsoDate)).toBe(true);
    // Week 6.
    expect(blockIsClosingNow(first, "2026-07-24" as IsoDate)).toBe(false);
  });

  it("only ever warns about one block at a time", () => {
    const week5 = "2026-07-20" as IsoDate;
    expect(blockIsClosingNow(first, week5)).toBe(true);
    expect(blockIsClosingNow(second, week5)).toBe(false);
    expect(blockIsClosingNow(last, week5)).toBe(false);
  });
});

describe("daysUntilBlockCloses", () => {
  const [first, , last] = entryBlocks(START, WEEKS);

  it("counts today as one of the days left", () => {
    // 23 July is the closing date, so on that morning there is one day left.
    expect(daysUntilBlockCloses(first, "2026-07-23" as IsoDate)).toBe(1);
    expect(daysUntilBlockCloses(first, "2026-07-22" as IsoDate)).toBe(2);
    expect(daysUntilBlockCloses(first, "2026-07-17" as IsoDate)).toBe(7);
  });

  it("is zero once the block has gone", () => {
    expect(daysUntilBlockCloses(first, "2026-07-24" as IsoDate)).toBe(0);
  });

  it("is unknowable for the final block", () => {
    expect(daysUntilBlockCloses(last, "2026-09-20" as IsoDate)).toBeNull();
  });
});

describe("closedBlocks", () => {
  it("returns them in order, so the newest is the furthest to lock", () => {
    expect(closedBlocks(START, WEEKS, "2026-07-20" as IsoDate)).toHaveLength(0);
    expect(
      closedBlocks(START, WEEKS, "2026-07-24" as IsoDate).map((b) => b.index),
    ).toEqual([1]);
    expect(
      closedBlocks(START, WEEKS, "2026-08-21" as IsoDate).map((b) => b.index),
    ).toEqual([1, 2]);
    // Even a year later the final block is not on this list.
    expect(
      closedBlocks(START, WEEKS, "2027-06-01" as IsoDate).map((b) => b.index),
    ).toEqual([1, 2]);
  });
});
