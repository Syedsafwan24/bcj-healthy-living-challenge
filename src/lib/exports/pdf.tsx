import "server-only";

import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { ExportTable } from "./data";
import { measureColumns } from "./table-layout";

/**
 * PDF export — build specification section 6.
 *
 * @react-pdf/renderer renders on the server without a browser binary. The
 * palette follows section 9.1: green-900 for the header band, n-600 for
 * secondary text, and dark text on every tinted fill.
 */

// @react-pdf hyphenates words that do not fit, which turned the "Gender"
// heading into "Gen-der". A table column is not prose: a word that does not
// fit should wrap or be clipped, never be broken with a hyphen that looks
// like part of the data.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 44,
    paddingHorizontal: 28,
    fontSize: 7.5,
    fontFamily: "Helvetica",
    color: "#161C19", // n-900
  },
  header: {
    backgroundColor: "#023223", // green-900
    color: "#EBFAF2",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginBottom: 12,
  },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 8, marginTop: 3, color: "#A0E7C6" },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 7,
    color: "#4E5C56", // n-600
  },
  table: { borderTopWidth: 0.5, borderTopColor: "#CBD5D0" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E2E8E5",
    minHeight: 14,
    alignItems: "flex-start",
  },
  headRow: {
    flexDirection: "row",
    backgroundColor: "#EFF3F1", // n-100
    borderBottomWidth: 0.5,
    borderBottomColor: "#CBD5D0",
    minHeight: 16,
    alignItems: "center",
  },
  cell: { paddingVertical: 3, paddingHorizontal: 3 },
  headCell: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
  },
  zebra: { backgroundColor: "#F7FAF9" }, // n-50
  footer: {
    position: "absolute",
    bottom: 20,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#6B7B74", // n-500, non-essential detail
  },
});

function ResultsDocument({ table }: { table: ExportTable }) {
  const { widths, numeric } = measureColumns(table.columns, table.rows);
  // Landscape for wide tables, portrait for narrow ones. A4 either way, so
  // the file prints on the paper an office actually has.
  const orientation = table.columns.length > 8 ? "landscape" : "portrait";

  // Resolved once rather than per cell. A 17-column roster of 500 people is
  // 8,500 cells, and merging a style array at each one is wasted work.
  const headStyles = widths.map((width, index) => ({
    ...styles.headCell,
    width,
    textAlign: (numeric[index] ? "right" : "left") as "right" | "left",
  }));
  const cellStyles = widths.map((width, index) => ({
    ...styles.cell,
    width,
    textAlign: (numeric[index] ? "right" : "left") as "right" | "left",
  }));

  return (
    <Document
      title={table.title}
      author="BCJ Healthy Living Challenge"
      creator="Bhatkal Community Jeddah"
    >
      <Page size="A4" orientation={orientation} style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.title}>{table.title}</Text>
          <Text style={styles.subtitle}>{table.subtitle}</Text>
        </View>

        <View style={styles.meta} fixed>
          <Text>Generated {table.generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC</Text>
          <Text>{table.rows.length} rows</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            {table.columns.map((column, index) => (
              <Text key={column} style={headStyles[index]}>
                {column}
              </Text>
            ))}
          </View>

          {table.rows.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={rowIndex % 2 === 1 ? [styles.row, styles.zebra] : styles.row}
              wrap={false}
            >
              {row.map((cell, cellIndex) => (
                <Text key={cellIndex} style={cellStyles[cellIndex]}>
                  {String(cell ?? "")}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>Bhatkal Community Jeddah · bcjed.com</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function toPdf(table: ExportTable): Promise<Buffer> {
  return renderToBuffer(<ResultsDocument table={table} />);
}
