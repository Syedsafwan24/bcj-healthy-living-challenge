import "@/db/load-env";
import { describe, expect, it } from "vitest";

/**
 * The category divisions decide who wins a prize, so the grouping is worth
 * pinning down: which divisions exist, who is in them, and that a rank inside
 * a division counts from 1 rather than carrying over the overall position.
 *
 * Kids became a third category on 8 September 2026 so that children are not
 * ranked against adults. The rule that matters most is that the three do not
 * overlap — a participant holds exactly one, so nobody can be counted twice
 * or left off the board.
 *
 * groupLeaderboard is pure, but it lives in queries.ts alongside the database
 * client, so it is imported dynamically and skipped when no database is
 * configured — the same arrangement the integration suite uses.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

type Category = "male" | "female" | "kids";

type Row = {
  participantId: string;
  displayName: string;
  category: Category;
  dietCategory: string | null;
  dietCode: string | null;
  dietSort: number;
  finalScore: number;
  finalPercentage: number;
  rank: number;
};

function row(
  name: string,
  category: Category,
  code: string | null,
  sort: number,
  score: number,
): Row {
  return {
    participantId: name,
    displayName: name,
    category,
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

  // Ordered by score descending, as getLeaderboard returns them. Yusuf and
  // Hana are the kids, and both outscore some of the adults — which is the
  // situation the third division exists for.
  const rows = [
    row("Ayesha", "female", "A", 1, 900),
    row("Bilal", "male", "A", 1, 800),
    row("Fatima", "female", "A", 1, 700),
    row("Yusuf", "kids", "K", 0, 650),
    row("Imran", "male", "B", 2, 600),
    row("Zainab", "female", "B", 2, 500),
    row("Hana", "kids", "K", 0, 450),
    row("Omar", "male", "A", 1, 400),
  ];

  it("loads", async () => {
    ({ groupLeaderboard } = await import("@/lib/queries"));
    expect(typeof groupLeaderboard).toBe("function");
  });

  it("splits the board into male, female and kids, in that order", () => {
    const groups = groupLeaderboard(rows, "category");
    expect(groups.map((g: any) => g.title)).toEqual([
      "Male",
      "Female",
      "Kids",
    ]);
  });

  it("ranks each division from 1, not from the overall position", () => {
    const groups = groupLeaderboard(rows, "category");

    const male = groups.find((g: any) => g.title === "Male");
    // Bilal is 2nd overall but 1st among the men.
    expect(male.rows.map((r: any) => [r.displayName, r.rank])).toEqual([
      ["Bilal", 1],
      ["Imran", 2],
      ["Omar", 3],
    ]);

    const kids = groups.find((g: any) => g.title === "Kids");
    // Yusuf is 4th overall and would never place against the adults; among
    // the children he is first, which is the whole point of the division.
    expect(kids.rows.map((r: any) => [r.displayName, r.rank])).toEqual([
      ["Yusuf", 1],
      ["Hana", 2],
    ]);
  });

  it("never mixes two categories in one division", () => {
    for (const group of groupLeaderboard(rows, "category")) {
      const categories = new Set(group.rows.map((r: any) => r.category));
      expect(categories.size).toBe(1);
    }
  });

  it("counts every participant exactly once", () => {
    // The three categories do not overlap, so the divisions together hold the
    // whole board — nobody duplicated, nobody missing. A category that could
    // apply to the same person twice would break this.
    const groups = groupLeaderboard(rows, "category");
    const names = groups.flatMap((g: any) =>
      g.rows.map((r: any) => r.displayName),
    );
    expect(names).toHaveLength(rows.length);
    expect(new Set(names).size).toBe(rows.length);
  });

  it("puts everyone in a division, with or without a diet category", () => {
    // Weight is optional at registration, so the diet band it derives from is
    // often missing. The competition category is asked of everyone, so nobody
    // lands in an "unassigned" bucket the way they did under the old grouping.
    const groups = groupLeaderboard(
      [...rows, row("Rehan", "male", null, 99, 300)],
      "category",
    );
    expect(groups).toHaveLength(3);
    const counted = groups.reduce((n: number, g: any) => n + g.rows.length, 0);
    expect(counted).toBe(rows.length + 1);
  });

  it("shows only the divisions that have somebody in them", () => {
    // A season with no children registered should not print an empty Kids
    // table under the other two.
    const adultsOnly = rows.filter((r) => r.category !== "kids");
    const groups = groupLeaderboard(adultsOnly, "category");
    expect(groups.map((g: any) => g.title)).toEqual(["Male", "Female"]);
  });

  it("gives everyone tied the same rank, and never 0", () => {
    // Every participant starts a season on 0.0, so the first leaderboard of a
    // challenge is entirely ties. A tie copies the rank above it, which has to
    // be the rank already assigned — reading it from the unranked input gave
    // the second of a tie rank 0.
    const tied = [
      row("Adil", "male", "A", 1, 0),
      row("Bilal", "male", "A", 1, 0),
      row("Cadir", "male", "A", 1, 0),
    ];
    const [male] = groupLeaderboard(tied, "category");
    expect(male.rows.map((r: any) => r.rank)).toEqual([1, 1, 1]);
  });

  it("skips ranks after a tie, so 1, 2, 2, 4", () => {
    const scores = [
      row("Adil", "male", "A", 1, 900),
      row("Bilal", "male", "A", 1, 800),
      row("Cadir", "male", "A", 1, 800),
      row("Danish", "male", "A", 1, 700),
    ];
    const [male] = groupLeaderboard(scores, "category");
    expect(male.rows.map((r: any) => [r.displayName, r.rank])).toEqual([
      ["Adil", 1],
      ["Bilal", 2],
      ["Cadir", 2],
      ["Danish", 4],
    ]);
  });

  it("keeps everyone in one group when undivided", () => {
    const groups = groupLeaderboard(rows, "overall");
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(rows.length);
  });
});
