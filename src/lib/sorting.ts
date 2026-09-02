/**
 * Table sorting.
 *
 * Sort state lives in the URL (`?sort=<column>&dir=asc|desc`) so it survives a
 * refresh, composes with the filters already in the query string, and can be
 * shared or bookmarked. The header controls are ordinary links, so sorting
 * works without JavaScript.
 *
 * A raw `sort` value from the URL is matched against a per-table allowlist and
 * falls back to that table's default, so nothing from the query string ever
 * reaches SQL unvalidated.
 *
 * This module is pure and imports no database code, because the pages and the
 * header component both use it.
 */

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export interface SortConfig<K extends string> {
  readonly keys: readonly K[];
  readonly defaultKey: K;
  readonly defaultDir: SortDir;
  /**
   * Columns that read better descending on the first click — scores and
   * dates, where "highest" or "most recent" is the question being asked.
   */
  readonly descFirst?: readonly K[];
}

/** Keeps the key union literal so a typo is a compile error. */
export function defineSort<const K extends string>(
  config: SortConfig<K>,
): SortConfig<K> {
  return config;
}

/** The subset of a page's searchParams this module needs. */
export type SortParams = Record<string, string | string[] | undefined>;

/**
 * Resolves the sort state from the URL. Total: an unknown or missing column
 * degrades to the table's default rather than throwing, so a stale bookmark
 * still renders.
 */
export function resolveSort<K extends string>(
  config: SortConfig<K>,
  params: SortParams,
): SortState<K> {
  const raw = typeof params.sort === "string" ? params.sort : undefined;
  const key = (config.keys as readonly string[]).includes(raw ?? "")
    ? (raw as K)
    : config.defaultKey;

  const rawDir = params.dir;
  const dir: SortDir =
    rawDir === "asc" || rawDir === "desc"
      ? rawDir
      : key === config.defaultKey
        ? config.defaultDir
        : config.descFirst?.includes(key)
          ? "desc"
          : "asc";

  return { key, dir };
}

export interface SortContext<K extends string> {
  pathname: string;
  params: SortParams;
  config: SortConfig<K>;
  state: SortState<K>;
}

/**
 * The href a column header points at: every current filter, plus this column
 * as the sort, toggled if it is already active.
 *
 * `page` is deliberately dropped — re-sorting a paginated list should return
 * to the first page rather than leave the reader on page 4 of a new ordering.
 * Every other parameter is copied through, so a filter added later composes
 * with sorting without touching this function.
 */
export function sortHref<K extends string>(
  ctx: SortContext<K>,
  column: K,
): string {
  const next: SortDir =
    ctx.state.key === column
      ? ctx.state.dir === "asc"
        ? "desc"
        : "asc"
      : ctx.config.descFirst?.includes(column)
        ? "desc"
        : "asc";

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.params)) {
    if (key === "sort" || key === "dir" || key === "page") continue;
    if (value === undefined || value === "") continue;
    query.set(key, Array.isArray(value) ? value[0] : value);
  }
  query.set("sort", column);
  query.set("dir", next);

  return `${ctx.pathname}?${query.toString()}`;
}

export function ariaSort<K extends string>(
  state: SortState<K>,
  column: K,
): "none" | "ascending" | "descending" {
  if (state.key !== column) return "none";
  return state.dir === "asc" ? "ascending" : "descending";
}

/* ------------------------------------------------------------------ */
/* Comparators, for the tables that sort in JavaScript                 */
/* ------------------------------------------------------------------ */

export type Comparator<T> = (a: T, b: T) => number;

export function flip<T>(compare: Comparator<T>, dir: SortDir): Comparator<T> {
  return dir === "asc" ? compare : (a, b) => -compare(a, b);
}

/**
 * Keeps empty values at the bottom whichever direction is chosen — the JS twin
 * of SQL's NULLS LAST. "No score yet" is not a low score, so it belongs last in
 * both "highest first" and "lowest first". Wraps an already-flipped
 * comparator, so reversing does not float nulls to the top.
 */
export function nullsLast<T>(
  compare: Comparator<T>,
  isEmpty: (row: T) => boolean,
): Comparator<T> {
  return (a, b) => {
    const aEmpty = isEmpty(a);
    const bEmpty = isEmpty(b);
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return compare(a, b);
  };
}

/** Case-insensitive text compare, so "abdul" does not sort after "Zainab". */
export function byText(value: string, other: string): number {
  return value.localeCompare(other, "en", { sensitivity: "base" });
}

/**
 * Sorts a copy of `rows`. The tiebreak is never direction-flipped, so equal
 * values keep a fixed order between page loads rather than shuffling.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  comparators: Record<K, (dir: SortDir) => Comparator<T>>,
  state: SortState<K>,
  tiebreak: Comparator<T>,
): T[] {
  const primary = comparators[state.key](state.dir);
  return [...rows].sort((a, b) => primary(a, b) || tiebreak(a, b));
}
