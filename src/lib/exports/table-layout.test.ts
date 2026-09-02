import { describe, expect, it } from "vitest";

import { MAX_CHARS, MIN_CHARS, measureColumns } from "./table-layout";

/**
 * The participants PDF lost data before these rules existed: widths were
 * derived from the heading text, so "Mobile" was sized for six characters and
 * "+966500000123" ran over the Age column beside it.
 */
describe("measureColumns", () => {
  const columns = ["No.", "Mobile", "Age", "Email"];
  const rows = [[1, "+966500000123", 22, "participant.name@example.com"]];

  function pct(width: string) {
    return Number(width.replace("%", ""));
  }

  it("sizes a column by its widest value, not its heading", () => {
    const { widths } = measureColumns(columns, rows);
    // Mobile's heading is 6 characters, its value 13. It must beat Age, whose
    // heading is 3 and whose value is 2 — the collision that hid the age.
    expect(pct(widths[1])).toBeGreaterThan(pct(widths[2]));
  });

  it("widths sum to the full table", () => {
    const { widths } = measureColumns(columns, rows);
    const total = widths.reduce((sum, w) => sum + pct(w), 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it("caps a long value so it cannot starve the other columns", () => {
    const long = "x".repeat(300);
    const { widths } = measureColumns(["A", "B"], [[long, "b"]]);
    // Capped at MAX_CHARS against B's floor of MIN_CHARS.
    expect(pct(widths[0])).toBeCloseTo(
      (MAX_CHARS / (MAX_CHARS + MIN_CHARS)) * 100,
      1,
    );
  });

  it("gives a short heading a minimum width", () => {
    const { widths } = measureColumns(["A", "Description"], [["1", "hello"]]);
    expect(pct(widths[0])).toBeCloseTo(
      (MIN_CHARS / (MIN_CHARS + "Description".length)) * 100,
      1,
    );
  });

  it("marks numeric columns for right alignment", () => {
    const { numeric } = measureColumns(
      ["Seq", "Score", "Name", "Mobile", "Empty"],
      [
        [1, "0.0000", "Ayesha", "+966500000123", ""],
        [2, "1,024.50", "Ayesha", "+966500000111", ""],
      ],
    );
    expect(numeric).toEqual([true, true, false, false, false]);
  });

  it("ignores blanks when deciding a column is numeric", () => {
    const { numeric } = measureColumns(
      ["Weight"],
      [["51.00"], [""], ["62.25"]],
    );
    expect(numeric[0]).toBe(true);
  });

  it("handles a table with no rows", () => {
    const { widths, numeric } = measureColumns(["A", "B"], []);
    expect(widths).toHaveLength(2);
    expect(numeric).toEqual([false, false]);
  });
});
