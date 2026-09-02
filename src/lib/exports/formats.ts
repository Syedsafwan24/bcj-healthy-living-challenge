import "server-only";

import ExcelJS from "exceljs";

import type { ExportTable } from "./data";

/**
 * Export formats — build specification section 6.
 *
 * CSV is hand-written with no dependency. XLSX uses exceljs. PDF is rendered
 * by @react-pdf/renderer in `pdf.tsx`, which runs on the server without a
 * browser binary.
 *
 * All three read the same `ExportTable`, so the three files always agree with
 * each other and with the screen.
 */

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

function csvCell(value: string | number): string {
  const text = String(value ?? "");
  // A leading =, +, - or @ is executed as a formula by Excel, so a value that
  // starts with one is prefixed with a quote. Registration IDs and names are
  // participant-supplied, and an export is opened by an organiser.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(table: ExportTable): string {
  const lines = [
    table.columns.map(csvCell).join(","),
    ...table.rows.map((row) => row.map(csvCell).join(",")),
  ];
  // A BOM so Excel opens UTF-8 names correctly on Windows.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

export async function toXlsx(table: ExportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BCJ Healthy Living Challenge";
  workbook.created = table.generatedAt;

  const sheet = workbook.addWorksheet("Results", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = table.columns.map((header) => ({
    header,
    width: Math.min(Math.max(header.length + 4, 12), 40),
  }));

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF023223" }, // green-900, BCJ brand colour
  };
  sheet.getRow(1).height = 22;
  sheet.getRow(1).alignment = { vertical: "middle" };

  for (const row of table.rows) sheet.addRow(row);

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: table.columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/* ------------------------------------------------------------------ */
/* Filenames                                                           */
/* ------------------------------------------------------------------ */

export function exportFilename(
  kind: string,
  extension: string,
  generatedAt = new Date(),
): string {
  const stamp = generatedAt.toISOString().slice(0, 10);
  return `bcj-challenge-${kind}-${stamp}.${extension}`;
}

export const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};
