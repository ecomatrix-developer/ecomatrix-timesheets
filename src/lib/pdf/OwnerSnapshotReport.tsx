import "server-only";
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { OwnerReportData, EmployeeWeeklyGrid } from "@/lib/reportData";
import { PieChart, PieLegend, GroupedBarChart, HorizontalBarChart } from "./PdfCharts";

const ACCENT = "#4c1d95";

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },
  headerBar: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderColor: ACCENT,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  h1: { fontSize: 18, color: ACCENT, fontWeight: 700 },
  subtitle: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  h2: {
    fontSize: 12,
    color: ACCENT,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: "#ddd6fe",
    paddingBottom: 3,
  },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, padding: 12, marginBottom: 4, backgroundColor: "#fafafa" },
  chartLabel: { fontWeight: 700, fontSize: 9, marginBottom: 6, color: "#374151" },
  li: { marginBottom: 3, fontSize: 8.5 },
  sectionDivider: { marginBottom: 10 },

  // Employee weekly grid table — now rendered in a flowing, compact grid of
  // 2 employees per page (landscape) instead of one employee per page, so
  // a 12-employee report no longer burns 12 nearly-empty pages.
  gridPage: { padding: 24, paddingBottom: 40, fontSize: 7, fontFamily: "Helvetica" },
  gridPageHeader: {
    fontSize: 11,
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: "#ddd6fe",
    paddingBottom: 4,
  },
  employeeBlock: { marginBottom: 14 },
  employeeName: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  table: { display: "flex", flexDirection: "column", borderWidth: 1, borderColor: "#ccc" },
  row: { flexDirection: "row" },
  headerCell: {
    flex: 1,
    padding: 2,
    backgroundColor: "#f2f2f2",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ccc",
    textAlign: "center",
    fontWeight: 700,
  },
  labelCell: {
    width: 110,
    padding: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ccc",
    fontWeight: 700,
  },
  cell: { flex: 1, padding: 2, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#ccc", textAlign: "center" },
  totalRow: { backgroundColor: "#fff3cd" },
  overtimeRow: { backgroundColor: "#f8d7da" },

  // Compact one-line entry for an employee with no hours logged — avoids
  // the previous behaviour of giving every employee a full page even when
  // they have nothing to show.
  emptyEmployeeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: "#f0f0f0",
  },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#9ca3af",
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
    paddingTop: 6,
  },
});

function fmt(n: number): string {
  return n ? n.toFixed(2) : "";
}

function PageFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Eco Matrix Engineering · Owner&apos;s Weekly Snapshot · Generated {generatedAt}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function EmployeeGridBlock({ grid }: { grid: EmployeeWeeklyGrid }) {
  return (
    <View style={styles.employeeBlock} wrap={false}>
      <Text style={styles.employeeName}>{grid.employee.name}</Text>
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
    </View>
  );
}

export function OwnerSnapshotReportDoc({ data }: { data: OwnerReportData }) {
  const totalEmployees = data.compliantEmployees.length + data.pendingSubmissions.length;
  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const employeesWithHours = data.employeeGrids.filter((g) => g.rows.length > 0);
  const employeesWithoutHours = data.employeeGrids.filter((g) => g.rows.length === 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.h1}>Owner&apos;s Weekly Snapshot</Text>
            <Text style={styles.subtitle}>
              Week of {data.dates[0]} to {data.dates[data.dates.length - 1]}
            </Text>
          </View>
          <Text style={{ fontSize: 8, color: "#9ca3af" }}>Eco Matrix Engineering</Text>
        </View>

        <Text style={styles.h2}>Weekly Dashboard</Text>
        <View style={styles.card}>
          <Text style={styles.chartLabel}>Overall Work Distribution</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <PieChart
              data={[
                { name: "Billable", hours: data.billableHours },
                { name: "Non-Billable", hours: data.nonBillableHours },
              ]}
              size={90}
            />
            <View style={{ marginLeft: 14 }}>
              <PieLegend
                data={[
                  { name: "Billable", hours: data.billableHours },
                  { name: "Non-Billable", hours: data.nonBillableHours },
                ]}
              />
            </View>
          </View>

          <Text style={styles.chartLabel}>Billable vs. Non-Billable Hours per Employee</Text>
          {data.employeeBillableSplit.length === 0 ? (
            <Text style={{ marginBottom: 12, fontSize: 8.5, color: "#6b7280" }}>No hours logged this week.</Text>
          ) : (
            <View style={{ marginBottom: 12 }}>
              <GroupedBarChart
                rows={data.employeeBillableSplit.map((e) => ({
                  label: e.name,
                  values: [e.billable, e.nonBillable],
                }))}
              />
            </View>
          )}

          <Text style={styles.chartLabel}>Hours Distribution by Energy Modeling Category</Text>
          {data.energyCategoryHours.length === 0 ? (
            <Text style={{ marginBottom: 12, fontSize: 8.5, color: "#6b7280" }}>
              No category-tagged hours logged this week.
            </Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <PieChart data={data.energyCategoryHours} size={90} />
              <View style={{ marginLeft: 14 }}>
                <PieLegend data={data.energyCategoryHours} />
              </View>
            </View>
          )}

          <Text style={styles.chartLabel}>Top 5 Projects by Hours</Text>
          {data.topProjects.length === 0 ? (
            <Text style={{ fontSize: 8.5, color: "#6b7280" }}>No billable hours logged this week.</Text>
          ) : (
            <HorizontalBarChart data={data.topProjects} />
          )}
        </View>

        <Text style={styles.h2}>Timesheet Compliance</Text>
        <View style={styles.card}>
          <Text style={{ fontWeight: 700, marginBottom: 6, fontSize: 9.5 }}>
            {data.compliantEmployees.length}/{totalEmployees} Employees Compliant
          </Text>
          <Text style={{ fontWeight: 700, marginBottom: 3 }}>Pending Submissions:</Text>
          {data.pendingSubmissions.length === 0 ? (
            <Text style={{ fontSize: 8.5, color: "#6b7280" }}>None — everyone is up to date.</Text>
          ) : (
            data.pendingSubmissions.map((p) => (
              <Text key={p.name} style={styles.li}>
                • {p.name}: Missing {p.missingDays.join(", ")}
              </Text>
            ))
          )}
        </View>

        <Text style={styles.h2}>Red Flags &amp; Anomalies</Text>
        <View style={styles.card}>
          {data.redFlags.length === 0 ? (
            <Text style={{ fontSize: 8.5, color: "#6b7280" }}>No anomalies detected.</Text>
          ) : (
            data.redFlags.map((f, i) => (
              <Text key={i} style={styles.li}>
                • {f}
              </Text>
            ))
          )}
        </View>

        <PageFooter generatedAt={generatedAt} />
      </Page>

      {/* Employee weekly grids — wrap=true (the default) lets react-pdf
          flow multiple employees' tables down one landscape page and
          naturally paginate once it runs out of room, instead of forcing
          exactly one employee per page regardless of how little content
          they have. Each individual employee block still has wrap={false}
          so a single employee's table is never split mid-row across two
          pages. */}
      {employeesWithHours.length > 0 && (
        <Page size="A4" orientation="landscape" style={styles.gridPage}>
          <Text style={styles.gridPageHeader} fixed>
            Employee Timesheets — Week of {data.dates[0]} to {data.dates[data.dates.length - 1]}
          </Text>
          {employeesWithHours.map((grid) => (
            <EmployeeGridBlock key={grid.employee.id} grid={grid} />
          ))}
          <PageFooter generatedAt={generatedAt} />
        </Page>
      )}

      {/* Employees with nothing logged this week get one compact line each
          on a single shared page, instead of a nearly-blank full page. */}
      {employeesWithoutHours.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h2}>No Hours Logged This Week</Text>
          <View style={styles.card}>
            {employeesWithoutHours.map((grid) => (
              <View key={grid.employee.id} style={styles.emptyEmployeeRow}>
                <Text style={{ fontWeight: 700 }}>{grid.employee.name}</Text>
                <Text style={{ color: "#9ca3af" }}>0.00h</Text>
              </View>
            ))}
          </View>
          <PageFooter generatedAt={generatedAt} />
        </Page>
      )}
    </Document>
  );
}
