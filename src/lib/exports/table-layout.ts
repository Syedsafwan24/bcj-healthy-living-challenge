/**
 * Column sizing for the PDF export — pure, so it can be tested without the
 * renderer (@react-pdf pulls in a font stack and does not load outside the
 * bundler).
 *
 * Widths come from the widest value actually in each column, not from the
 * length of its heading. Sizing by heading alone gave "Mobile" (6 characters)
 * less room than "+966500000123" (13), so the number overflowed into the Age
 * column beside it and hid the age entirely — the export lost data rather
 * than merely looking cramped.
 *
 * Widths are capped at MAX_CHARS so one long email cannot starve the rest of
 * the table; anything longer wraps onto a second line. They are floored at
 * MIN_CHARS so a short heading such as "No." still has room to breathe.
 */

export const MIN_CHARS = 5;
export const MAX_CHARS = 24;

/**
 * A value that should be right-aligned: a plain number, optionally grouped
 * and optionally negative.
 *
 * A leading "+" is deliberately not accepted. Mobile numbers are stored in
 * E.164 ("+966500000123"), and treating them as numbers right-aligned a
 * column of phone numbers against a column of scores.
 */
const NUMERIC = /^-?\d[\d,]*(\.\d+)?$/;

export interface ColumnLayout {
  /** Percentage widths, in column order, summing to 100. */
  widths: string[];
  /** True where every non-empty value in the column is a number. */
  numeric: boolean[];
}

export function measureColumns(
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
): ColumnLayout {
  const chars: number[] = [];
  const numeric: boolean[] = [];

  columns.forEach((header, index) => {
    let widest = header.length;
    let sawValue = false;
    let allNumeric = true;

    for (const row of rows) {
      const text = String(row[index] ?? "");
      if (text.length > widest) widest = text.length;
      if (text === "") continue;
      sawValue = true;
      if (allNumeric && !NUMERIC.test(text)) allNumeric = false;
    }

    chars.push(Math.min(Math.max(widest, MIN_CHARS), MAX_CHARS));
    // A column of numbers reads far better right-aligned, and the decimal
    // points line up. An all-empty column is left alone.
    numeric.push(sawValue && allNumeric);
  });

  const total = chars.reduce((sum, w) => sum + w, 0);
  return {
    widths: chars.map((w) => `${((w / total) * 100).toFixed(3)}%`),
    numeric,
  };
}
