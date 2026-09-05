import "@/db/load-env";
import { describe, expect, it } from "vitest";

/**
 * The category-and-gender divisions decide who wins a prize, so the grouping
 * is worth pinning down: which divisions exist, who is in them, and that a
 * rank inside a division counts from 1 rather than carrying over the overall
 * position.
 *
 * groupLeaderboard is pure, but it lives in queries.ts alongside the database
 * client, so it is imported dynamically and skipped when no database is
 * configured — the same arrangement the integration suite uses.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

type Row = {
  participantId: string;
  displayName: string;
  gender: "male" | "female";
  dietCategory: string | null;
  dietCode: string | null;
  dietSort: number;
  finalScore: number;
  finalPercentage: number;
  rank: number;
};

function row(
  name: string,
  gender: "male" | "female",
  code: string | null,
  sort: number,
  score: number,
): Row {
  return {
    participantId: name,
    displayName: name,
    gender,
    dietCategory: code ? `${code} category` : null,
    dietCode: code,
    dietSort: sort,
    finalScore: score,
    finalPercentage: score / 12,
    rank: 0,
  };
}

suite("leaderboard divisions", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let groupLeaderboard: any;

  // Ordered by score descending, as getLeaderboard returns them.
  const rows = [
    row("Ayesha", "female", "A", 1, 900),
    row("Bilal", "male", "A", 1, 800),
    row("Fatima", "female", "A", 1, 700),
    row("Imran", "male", "B", 2, 600),
    row("Zainab", "female", "B", 2, 500),
    row("Yusuf", "male", "A", 1, 400),
  ];

  it("loads", async () => {
    ({ groupLeaderboard } = await import("@/lib/queries"));
    expect(typeof groupLeaderboard).toBe("function");
  });

  it("splits the board into men and women, men first", () => {
    const groups = groupLeaderboard(rows, "gender");
    expect(groups.map((g: any) => g.title)).toEqual(["Men", "Women"]);
  });

  it("ranks each division from 1, not from the overall position", () => {
    const groups = groupLeaderboard(rows, "gender");
    const men = groups.find((g: any) => g.title === "Men");
    // Bilal is 2nd overall but 1st among the men.
    expect(men.rows.map((r: any) => [r.displayName, r.rank])).toEqual([
      ["Bilal", 1],
      ["Imran", 2],
      ["Yusuf", 3],
    ]);
  });

  it("never puts men and women in the same division", () => {
    for (const group of groupLeaderboard(rows, "gender")) {
      const genders = new Set(group.rows.map((r: any) => r.gender));
      expect(genders.size).toBe(1);
    }
  });

  it("puts everyone in a division, with or without a diet category", () => {
    // Weight is optional at registration, so the diet category it derives
    // from is often missing. Gender is asked of everyone, so nobody lands in
    // an "unassigned" bucket the way they did under the old grouping.
    const groups = groupLeaderboard(
      [...rows, row("Omar", "male", null, 99, 300)],
      "gender",
    );
    expect(groups).toHaveLength(2);
    const counted = groups.reduce((n: number, g: any) => n + g.rows.length, 0);
    expect(counted).toBe(rows.length + 1);
  });

  it("keeps everyone in one group when undivided", () => {
    const groups = groupLeaderboard(rows, "overall");
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(rows.length);
  });

});
