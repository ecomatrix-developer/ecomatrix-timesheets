import "server-only";
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { EmployeeWeeklyGrid } from "@/lib/reportData";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 14, marginBottom: 4, color: "#4c1d95" },
  subtitle: { fontSize: 9, marginBottom: 12, color: "#555" },
  table: { display: "flex", flexDirection: "column", borderWidth: 1, borderColor: "#ccc" },
  row: { flexDirection: "row" },
  headerCell: {
    flex: 1,
    padding: 3,
    backgroundColor: "#f2f2f2",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ccc",
    textAlign: "center",
    fontWeight: 700,
  },
  labelCell: {
    width: 130,
    padding: 3,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ccc",
    fontWeight: 700,
  },
  cell: {
    flex: 1,
    padding: 3,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ccc",
    textAlign: "center",
  },
  totalRow: { backgroundColor: "#fff3cd" },
  overtimeRow: { backgroundColor: "#f8d7da" },
});

function fmt(n: number): string {
  return n ? n.toFixed(2) : "";
}

export function WeeklyEmployeeReportDoc({ grid }: { grid: EmployeeWeeklyGrid }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Timesheet Report: {grid.employee.name}</Text>
        <Text style={styles.subtitle}>
          Week of {grid.dates[0]} to {grid.dates[grid.dates.length - 1]}
        </Text>

        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={styles.labelCell}>Project / Category</Text>
            {grid.dates.map((d) => (
              <Text key={d} style={styles.headerCell}>
                {new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short" })}
                {"\n"}
                {d.slice(8, 10)}
              </Text>
            ))}
          </View>

          {grid.rows.map((row) => (
            <View style={styles.row} key={row.label}>
              <Text style={styles.labelCell}>{row.label}</Text>
              {grid.dates.map((d) => (
                <Text key={d} style={styles.cell}>
                  {fmt(row.hoursByDate[d])}
                </Text>
              ))}
            </View>
          ))}

          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.labelCell}>Daily Total</Text>
            {grid.dates.map((d) => (
              <Text key={d} style={styles.cell}>
                {fmt(grid.dailyTotals[d])}
              </Text>
            ))}
          </View>
          <View style={[styles.row, styles.overtimeRow]}>
            <Text style={styles.labelCell}>Overtime</Text>
            {grid.dates.map((d) => (
              <Text key={d} style={styles.cell}>
                {fmt(grid.dailyOvertime[d])}
              </Text>
            ))}
          </View>
        </View>

        <Text style={{ marginTop: 10, fontSize: 9 }}>
          Week total: {grid.weekTotal.toFixed(2)}h · Overtime: {grid.weekOvertime.toFixed(2)}h
        </Text>
      </Page>
    </Document>
  );
}
