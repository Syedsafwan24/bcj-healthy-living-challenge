import "server-only";

import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";

import { db } from "@/db";
import {
  dailyEntries,
  dietCategories,
  finalScores,
  participantHealth,
  participants,
  weeklyScores,
  type DailyEntry,
  type Settings,
} from "@/db/schema";
import { addDays, datesInWeek, daysBetween, type IsoDate } from "@/lib/dates";
import type { EntryInputs } from "@/lib/scoring";
import {
  ENTRIES_SORT,
  PARTICIPANT_SORT,
  type EntriesSortKey,
  type LeaderboardSortKey,
  type ParticipantSortKey,
} from "@/lib/sort-columns";
import {
  byText,
  flip,
  nullsLast as nullsLastJs,
  resolveSort,
  sortRows,
  type Comparator,
  type SortDir,
  type SortState,
} from "@/lib/sorting";

/**
 * Read queries shared by the participant and admin screens.
 *
 * Every participant-facing function here takes a participantId that the
 * caller derived from the session cookie. Nothing in this file reads an id
 * from a URL or a request body (specification section 5.1).
 */

/** Turns a stored row into the shape the pure scoring function expects. */
export function entryToInputs(entry: DailyEntry): EntryInputs {
  return {
    waterLitres: entry.waterLitres === null ? null : Number(entry.waterLitres),
    steps: entry.steps,
    sleepHours: entry.sleepHours === null ? null : Number(entry.sleepHours),
    c3CookAtHome: entry.c3CookAtHome,
    c4NoSugary: entry.c4NoSugary,
    c5Vegetables: entry.c5Vegetables,
    c5VegetablesDinner: entry.c5VegetablesDinner,
    c6NoLateFood: entry.c6NoLateFood,
    c8Mindfulness: entry.c8Mindfulness,
    c9ScreenTime: entry.c9ScreenTime,
    breakfast: entry.breakfast,
    midMorning: entry.midMorning,
    lunch: entry.lunch,
    eveningSnack: entry.eveningSnack,
    dinner: entry.dinner,
  };
}

/* ------------------------------------------------------------------ */
/* Participant                                                         */
/* ------------------------------------------------------------------ */

export async function getEntry(
  participantId: string,
  entryDate: IsoDate,
): Promise<DailyEntry | null> {
  const [row] = await db
    .select()
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.participantId, participantId),
        eq(dailyEntries.entryDate, entryDate),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getEntriesBetween(
  participantId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<DailyEntry[]> {
  return db
    .select()
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.participantId, participantId),
        gte(dailyEntries.entryDate, from),
        lte(dailyEntries.entryDate, to),
      ),
    )
    .orderBy(asc(dailyEntries.entryDate));
}

export async function getWeeklyScores(participantId: string) {
  return db
    .select()
    .from(weeklyScores)
    .where(eq(weeklyScores.participantId, participantId))
    .orderBy(asc(weeklyScores.weekNo));
}

export async function getFinalScore(participantId: string) {
  const [row] = await db
    .select()
    .from(finalScores)
    .where(eq(finalScores.participantId, participantId))
    .limit(1);
  return row ?? null;
}

export async function getParticipantProfile(participantId: string) {
  const [row] = await db
    .select({
      id: participants.id,
      registrationId: participants.registrationId,
      fullName: participants.fullName,
      displayName: participants.displayName,
      email: participants.email,
      mobile: participants.mobile,
      age: participants.age,
      gender: participants.gender,
      areaOfResidence: participants.areaOfResidence,
      residenceStatus: participants.residenceStatus,
      heightCm: participants.heightCm,
      weightKg: participants.weightKg,
      startingWeightKg: participants.startingWeightKg,
      status: participants.status,
      registeredAt: participants.registeredAt,
      dietCategoryId: participants.dietCategoryId,
      dietCode: dietCategories.code,
      dietTitle: dietCategories.title,
      dietPlan: dietCategories.plan,
    })
    .from(participants)
    .leftJoin(dietCategories, eq(dietCategories.id, participants.dietCategoryId))
    .where(eq(participants.id, participantId))
    .limit(1);
  return row ?? null;
}

/**
 * The week grid used by /app/history: every date in the week with its entry,
 * or null where nothing has been recorded.
 */
export async function getWeekGrid(
  row: Settings,
  participantId: string,
  weekNo: number,
) {
  const dates = datesInWeek(row.startDate as IsoDate, weekNo);
  const entries = await db
    .select()
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.participantId, participantId),
        inArray(dailyEntries.entryDate, dates),
      ),
    );
  const byDate = new Map(entries.map((e) => [e.entryDate, e]));
  return dates.map((date) => ({ date, entry: byDate.get(date) ?? null }));
}

/* ------------------------------------------------------------------ */
/* Leaderboard — V6 section 9                                          */
/* ------------------------------------------------------------------ */

export interface LeaderboardRow {
  rank: number;
  participantId: string;
  displayName: string;
  finalScore: number;
  finalPercentage: number;
  gender: string;
  dietCategory: string | null;
  dietCode: string | null;
  dietSort: number;
}

/**
 * How the leaderboard is divided. "overall" is the ranking V6 section 9
 * defines; the rest are divisions BCJ asked for.
 *
 * "diet_gender" is the division prizes are decided on: one group per diet
 * category per gender. Diet category alone and gender alone are deliberately
 * not offered — BCJ judges on the pair, and a half-division would invite the
 * wrong winner to be read off the screen.
 */
export type LeaderboardSegment = "overall" | "diet_gender";

export interface LeaderboardGroup {
  key: string;
  title: string;
  /**
   * The diet category this division belongs to, so a page can offer one tab
   * per category without parsing the key or the title. "overall" for the
   * undivided board.
   */
  categoryCode: string;
  categoryTitle: string;
  rows: LeaderboardRow[];
}

/** One entry per diet category present on the board, in the category order. */
export interface LeaderboardCategory {
  code: string;
  title: string;
}

/**
 * The categories represented in a set of divisions, in the order the divisions
 * are already in — which is diet sort order, so the tabs match the page.
 */
export function leaderboardCategories(
  groups: LeaderboardGroup[],
): LeaderboardCategory[] {
  const seen = new Map<string, LeaderboardCategory>();
  for (const group of groups) {
    if (!seen.has(group.categoryCode)) {
      seen.set(group.categoryCode, {
        code: group.categoryCode,
        title: group.categoryTitle,
      });
    }
  }
  return Array.from(seen.values());
}

/**
 * Rank, approved display name, final score and final percentage — V6 section 9
 * and V5 section 11, both of which rank by final score, highest to lowest.
 *
 * The registration ID is deliberately not selected. V6 does not list it, and
 * because the ID is the only participant credential a public leaderboard
 * carrying it would hand out sign-in codes (specification section 2.2).
 *
 * The tie-break is a placeholder until open item O-5 is answered: equal final
 * scores share a rank, ordered by the earlier registration.
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      participantId: participants.id,
      displayName: participants.displayName,
      gender: participants.gender,
      dietCategory: dietCategories.title,
      dietCode: dietCategories.code,
      dietSort: dietCategories.sortOrder,
      finalScore: finalScores.finalScore,
      finalPercentage: finalScores.finalPercentage,
      registeredAt: participants.registeredAt,
    })
    .from(finalScores)
    .innerJoin(participants, eq(participants.id, finalScores.participantId))
    .leftJoin(dietCategories, eq(dietCategories.id, participants.dietCategoryId))
    .where(eq(participants.status, "active"))
    .orderBy(desc(finalScores.finalScore), asc(participants.registeredAt));

  return rank(
    rows.map((r) => ({
      participantId: r.participantId,
      displayName: r.displayName,
      finalScore: Number(r.finalScore),
      finalPercentage: Number(r.finalPercentage),
      gender: r.gender,
      dietCategory: r.dietCategory,
      dietCode: r.dietCode,
      dietSort: r.dietSort ?? 99,
      rank: 0,
    })),
  );
}

/**
 * Assigns ranks over an already-sorted list. Equal final scores share a rank,
 * and the next rank skips accordingly — 1, 2, 2, 4.
 */
function rank(rows: LeaderboardRow[]): LeaderboardRow[] {
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    return {
      ...row,
      rank:
        previous && previous.finalScore === row.finalScore
          ? previous.rank
          : index + 1,
    };
  });
}

/**
 * Splits the ranking into the divisions BCJ asked for.
 *
 * Neither V5 nor V6 defines a divided leaderboard — V5 section 6 describes the
 * diet categories as differing "food and portion guidance", not competition
 * classes, and scoring is identical across them because every day is scored as
 * a percentage of that day's own maximum. These groupings are therefore about
 * recognition rather than fairness, and each one re-ranks from 1 within its
 * own group. "Overall" remains the ranking the specification defines.
 */
export function groupLeaderboard(
  rows: LeaderboardRow[],
  segment: LeaderboardSegment,
): LeaderboardGroup[] {
  if (segment === "overall") {
    return [
      {
        key: "overall",
        title: "Overall",
        categoryCode: "overall",
        categoryTitle: "Overall",
        rows,
      },
    ];
  }

  const buckets = new Map<
    string,
    {
      title: string;
      categoryCode: string;
      categoryTitle: string;
      sort: number;
      rows: LeaderboardRow[];
    }
  >();

  // One division per diet category per gender. Men and women are never ranked
  // against each other, and a category on its own is not a division: BCJ
  // decides prizes on the pair, so "50 to 60 kg" splits into "50 to 60 kg
  // · Men" and "50 to 60 kg · Women".
  for (const row of rows) {
    const genderLabel = row.gender === "male" ? "Men" : "Women";
    const genderSort = row.gender === "male" ? 0 : 1;
    const diet = row.dietCategory ?? "No diet category assigned";
    const dietKey = row.dietCode ?? "unassigned";

    const key = `${dietKey}|${row.gender}`;
    const title = `${diet} · ${genderLabel}`;
    // Category first, then gender within it, so the two halves of a category
    // always sit next to each other on the page.
    const sort = row.dietSort * 10 + genderSort;

    if (!buckets.has(key)) {
      buckets.set(key, {
        title,
        categoryCode: dietKey,
        categoryTitle: diet,
        sort,
        rows: [],
      });
    }
    buckets.get(key)!.rows.push(row);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([key, bucket]) => ({
      key,
      title: bucket.title,
      categoryCode: bucket.categoryCode,
      categoryTitle: bucket.categoryTitle,
      // Already ordered by score; re-rank from 1 inside the group.
      rows: rank(bucket.rows.map((r) => ({ ...r, rank: 0 }))),
    }));
}

/**
 * Re-orders the rows inside each division for display.
 *
 * Ranks are NOT recomputed. Rank is derived from score order and assigned once
 * by `rank()` above, so sorting a division by name yields ranks like 7, 2, 15 —
 * the rank column keeps meaning "position by score", which is what an organiser
 * scanning for one person needs. If sorting re-ranked, the prize-deciding
 * category-and-gender divisions would silently report the wrong winners.
 *
 * Rank ascending is the canonical order and is a pass-through, so a URL with no
 * sort renders exactly as it did before sorting existed.
 */
export function sortLeaderboardGroups(
  groups: LeaderboardGroup[],
  state: SortState<LeaderboardSortKey>,
): LeaderboardGroup[] {
  if (state.key === "rank" && state.dir === "asc") return groups;

  const comparators: Record<
    LeaderboardSortKey,
    (dir: SortDir) => Comparator<LeaderboardRow>
  > = {
    rank: (d) => flip((a, b) => a.rank - b.rank, d),
    name: (d) => flip((a, b) => byText(a.displayName, b.displayName), d),
    diet: (d) =>
      nullsLastJs(
        flip((a, b) => a.dietSort - b.dietSort, d),
        (r) => r.dietCategory === null,
      ),
    score: (d) => flip((a, b) => a.finalScore - b.finalScore, d),
    percentage: (d) => flip((a, b) => a.finalPercentage - b.finalPercentage, d),
  };

  // Ranks tie, so rank alone is not a total order; the display name and then
  // the id keep each division's row order fixed between requests.
  const tiebreak: Comparator<LeaderboardRow> = (a, b) =>
    byText(a.displayName, b.displayName) ||
    a.participantId.localeCompare(b.participantId);

  return groups.map((group) => ({
    ...group,
    rows: sortRows(group.rows, comparators, state, tiebreak),
  }));
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export async function getAdminOverview(row: Settings, today: IsoDate) {
  const [registrations] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) FILTER (WHERE ${participants.status} = 'active')::int`,
      pending: sql<number>`count(*) FILTER (WHERE ${participants.status} = 'pending')::int`,
      withdrawn: sql<number>`count(*) FILTER (WHERE ${participants.status} = 'withdrawn')::int`,
    })
    .from(participants);

  const [todayStats] = await db
    .select({
      submitted: sql<number>`count(*) FILTER (WHERE ${dailyEntries.status} IN ('submitted','locked'))::int`,
      averagePercentage: sql<number>`coalesce(avg(${dailyEntries.dailyPercentage}) FILTER (WHERE ${dailyEntries.status} IN ('submitted','locked')), 0)::float8`,
    })
    .from(dailyEntries)
    .where(eq(dailyEntries.entryDate, today));

  const [overall] = await db
    .select({
      averageFinal: sql<number>`coalesce(avg(${finalScores.finalScore}), 0)::float8`,
      scored: count(),
    })
    .from(finalScores);

  return {
    registrations,
    today: todayStats,
    overall,
    startDate: row.startDate as IsoDate,
  };
}

export interface ParticipantListFilter {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  /** Raw values straight from the URL; validated by resolveSort below. */
  sort?: string;
  dir?: string;
}

/* ---- order expressions ---------------------------------------------- */

const direction = (dir: SortDir) => (dir === "asc" ? asc : desc);

/**
 * Explicit NULLS LAST.
 *
 * Postgres defaults to NULLS LAST on ASC but NULLS FIRST on DESC, so a plain
 * `desc(final_score)` would open "highest score first" with every participant
 * who has not been scored yet. Empty is not high, and it is not low either —
 * it belongs at the bottom in both directions.
 */
const nullsLast = (column: SQL | SQLWrapper, dir: SortDir) =>
  dir === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;

const PARTICIPANT_ORDER: Record<ParticipantSortKey, (dir: SortDir) => SQL[]> = {
  seq: (d) => [direction(d)(participants.seqNo)],
  name: (d) => [direction(d)(sql`lower(${participants.fullName})`)],
  regId: (d) => [direction(d)(participants.registrationId)],
  // By the graded sort order, not the title: the categories run 50–60, 60–75,
  // 75–90, so alphabetical would be meaningless.
  diet: (d) => [nullsLast(dietCategories.sortOrder, d)],
  // Lifecycle order, matching the filter bar, rather than alphabetical.
  status: (d) => [
    direction(d)(
      sql`case ${participants.status} when 'pending' then 0 when 'active' then 1 else 2 end`,
    ),
  ],
  score: (d) => [nullsLast(finalScores.finalScore, d)],
  registered: (d) => [direction(d)(participants.registeredAt)],
};

/**
 * seq_no is unique and NOT NULL, so appending it makes every ordering total.
 * Without that, ties let rows repeat on page 2 or vanish entirely as the
 * database is free to return them in any order between requests.
 */
export function participantOrder(state: SortState<ParticipantSortKey>): SQL[] {
  const primary = PARTICIPANT_ORDER[state.key](state.dir);
  return state.key === "seq" ? primary : [...primary, asc(participants.seqNo)];
}

export async function listParticipants(filter: ParticipantListFilter = {}) {
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;
  // Resolved here as well as on the page: it is pure and total, so a caller
  // that forgets to validate still cannot reach SQL with a raw column name.
  const sort = resolveSort(PARTICIPANT_SORT, {
    sort: filter.sort,
    dir: filter.dir,
  });

  const conditions = [sql`true`];
  if (filter.status && filter.status !== "all") {
    conditions.push(sql`${participants.status} = ${filter.status}`);
  }
  if (filter.search) {
    const term = `%${filter.search.toLowerCase()}%`;
    conditions.push(sql`(
      lower(${participants.fullName}) LIKE ${term}
      OR lower(${participants.displayName}) LIKE ${term}
      OR lower(${participants.email}::text) LIKE ${term}
      OR lower(${participants.registrationId}) LIKE ${term}
      OR ${participants.mobile} LIKE ${term}
    )`);
  }
  const where = sql.join(conditions, sql` AND `);

  const rows = await db
    .select({
      id: participants.id,
      registrationId: participants.registrationId,
      seqNo: participants.seqNo,
      fullName: participants.fullName,
      displayName: participants.displayName,
      email: participants.email,
      mobile: participants.mobile,
      age: participants.age,
      gender: participants.gender,
      weightKg: participants.weightKg,
      areaOfResidence: participants.areaOfResidence,
      status: participants.status,
      registeredAt: participants.registeredAt,
      dietCategoryId: participants.dietCategoryId,
      dietTitle: dietCategories.title,
      finalScore: finalScores.finalScore,
    })
    .from(participants)
    .leftJoin(dietCategories, eq(dietCategories.id, participants.dietCategoryId))
    .leftJoin(finalScores, eq(finalScores.participantId, participants.id))
    .where(where)
    .orderBy(...participantOrder(sort))
    .limit(limit)
    .offset(offset);

  const [total] = await db
    .select({ value: count() })
    .from(participants)
    .where(where);

  return { rows, total: total?.value ?? 0 };
}

/** Health fields, super admin only. Every read is audited by the caller. */
export async function getParticipantHealth(participantId: string) {
  const [row] = await db
    .select()
    .from(participantHealth)
    .where(eq(participantHealth.participantId, participantId))
    .limit(1);
  return row ?? null;
}

/** /admin/entries — one day across every active participant. */
const ENTRIES_ORDER: Record<EntriesSortKey, (dir: SortDir) => SQL[]> = {
  seq: (d) => [direction(d)(participants.seqNo)],
  name: (d) => [direction(d)(sql`lower(${participants.fullName})`)],
  regId: (d) => [direction(d)(participants.registrationId)],
  // Null for a participant with no record for the day, via the LEFT JOIN.
  score: (d) => [nullsLast(dailyEntries.dailyPercentage, d)],
  status: (d) => [nullsLast(dailyEntries.status, d)],
};

export async function listEntriesForDate(
  entryDate: IsoDate,
  sortParams: { sort?: string; dir?: string } = {},
) {
  const sort = resolveSort(ENTRIES_SORT, sortParams);
  const order = ENTRIES_ORDER[sort.key](sort.dir);
  return db
    .select({
      participantId: participants.id,
      registrationId: participants.registrationId,
      fullName: participants.fullName,
      displayName: participants.displayName,
      entryId: dailyEntries.id,
      entryDate: dailyEntries.entryDate,
      weekNo: dailyEntries.weekNo,
      dailyPoints: dailyEntries.dailyPoints,
      maxPoints: dailyEntries.maxPoints,
      dailyPercentage: dailyEntries.dailyPercentage,
      status: dailyEntries.status,
      submittedAt: dailyEntries.submittedAt,
    })
    .from(participants)
    .leftJoin(
      dailyEntries,
      and(
        eq(dailyEntries.participantId, participants.id),
        eq(dailyEntries.entryDate, entryDate),
      ),
    )
    .where(eq(participants.status, "active"))
    .orderBy(
      ...(sort.key === "seq" ? order : [...order, asc(participants.seqNo)]),
    );
}

export async function getEntryById(entryId: string) {
  const [row] = await db
    .select({
      entry: dailyEntries,
      participant: {
        id: participants.id,
        registrationId: participants.registrationId,
        fullName: participants.fullName,
        displayName: participants.displayName,
      },
    })
    .from(dailyEntries)
    .innerJoin(participants, eq(participants.id, dailyEntries.participantId))
    .where(eq(dailyEntries.id, entryId))
    .limit(1);
  return row ?? null;
}

/** Every scorable date in the competition, for exports and the nightly job. */
export function competitionDates(row: Settings): IsoDate[] {
  const total = row.totalWeeks * 7;
  return Array.from({ length: total }, (_, i) =>
    addDays(row.startDate as IsoDate, i),
  );
}

export { desc };

/**
 * How many days of the challenge so far the participant has nothing recorded
 * for, and the most recent one.
 *
 * Today is never counted: the day is not over, and telling someone they have
 * "missed" a day they can still fill in would be both wrong and discouraging.
 * Days before the challenge started and after today are outside the range.
 *
 * Counted as elapsed-minus-recorded rather than by listing every date, so it
 * stays one query whether the challenge is on day 3 or day 84. A "missing"
 * row is one the nightly job wrote for a day nobody filled in, so it counts
 * as missed just as an absent row does.
 */
export async function getMissedDays(
  settings: Settings,
  participantId: string,
  today: IsoDate,
): Promise<{ count: number; lastMissed: IsoDate | null }> {
  const firstDay = settings.startDate as IsoDate;
  const lastDay = addDays(firstDay, settings.totalWeeks * 7 - 1);

  // Yesterday, or the last day of the challenge if that came first.
  const yesterday = addDays(today, -1);
  const through = yesterday < lastDay ? yesterday : lastDay;

  const elapsed = daysBetween(firstDay, through) + 1;
  if (elapsed <= 0) return { count: 0, lastMissed: null };

  const [row] = await db
    .select({
      recorded: count(),
      newest: sql<string | null>`max(${dailyEntries.entryDate})`,
    })
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.participantId, participantId),
        ne(dailyEntries.status, "missing"),
        lte(dailyEntries.entryDate, through),
        gte(dailyEntries.entryDate, firstDay),
      ),
    );

  const missed = elapsed - Number(row?.recorded ?? 0);
  if (missed <= 0) return { count: 0, lastMissed: null };

  // The newest unrecorded day: walk back from `through` past anything filled
  // in. At most a handful of rows, and only when something is actually
  // missing.
  const filled = new Set(
    (
      await db
        .select({ entryDate: dailyEntries.entryDate })
        .from(dailyEntries)
        .where(
          and(
            eq(dailyEntries.participantId, participantId),
            ne(dailyEntries.status, "missing"),
            lte(dailyEntries.entryDate, through),
          ),
        )
        .orderBy(desc(dailyEntries.entryDate))
        .limit(40)
    ).map((r) => r.entryDate),
  );

  let cursor: IsoDate = through;
  while (filled.has(cursor) && cursor > firstDay) cursor = addDays(cursor, -1);

  return { count: missed, lastMissed: filled.has(cursor) ? null : cursor };
}
