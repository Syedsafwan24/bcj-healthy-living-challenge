import { defineSort } from "@/lib/sorting";

/**
 * Which columns each table may be sorted by.
 *
 * Kept apart from the queries so the pages and the header component can import
 * them without pulling in database code. The key union is derived from these
 * tuples, so a column cannot appear in a URL allowlist without a matching
 * order expression existing — that mismatch is a compile error.
 */

export const PARTICIPANT_SORT = defineSort({
  keys: ["seq", "name", "regId", "diet", "status", "score", "registered"],
  defaultKey: "seq",
  defaultDir: "asc",
  descFirst: ["score", "registered"],
});
export type ParticipantSortKey = (typeof PARTICIPANT_SORT.keys)[number];

export const ENTRIES_SORT = defineSort({
  keys: ["seq", "name", "regId", "score", "status"],
  defaultKey: "seq",
  defaultDir: "asc",
  descFirst: ["score"],
});
export type EntriesSortKey = (typeof ENTRIES_SORT.keys)[number];

export const LEADERBOARD_SORT = defineSort({
  keys: ["rank", "name", "diet", "score", "percentage"],
  defaultKey: "rank",
  defaultDir: "asc",
  descFirst: ["score", "percentage"],
});
export type LeaderboardSortKey = (typeof LEADERBOARD_SORT.keys)[number];

export const AUDIT_SORT = defineSort({
  keys: ["when", "action", "actor", "field"],
  defaultKey: "when",
  defaultDir: "desc",
  descFirst: ["when"],
});
export type AuditSortKey = (typeof AUDIT_SORT.keys)[number];

export const ACCOUNTS_SORT = defineSort({
  keys: ["name", "status", "twoFactor", "lastLogin"],
  defaultKey: "name",
  defaultDir: "asc",
  descFirst: ["lastLogin"],
});
export type AccountsSortKey = (typeof ACCOUNTS_SORT.keys)[number];
