import "server-only";
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import {
  monthLabel,
  monthYearLabel,
  formatLongDate,
  formatIndianNumber,
  amountInWords,
  totalEarnings,
  totalDeductions,
  totalPayout,
  formatIstTimestamp,
  type SalarySlipEarnings,
  type SalarySlipDeductions,
  type SalarySlipLeaveRow,
} from "@/lib/salarySlip";

const ACCENT = "#667eea";
const ACCENT_DARK = "#4c3a8f";
const INK = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 36, fontSize: 9, fontFamily: "Helvetica", color: INK },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  // Abeer, 2026-11-28: "the logo is not proper ... in the pdf downloaded
  // its not showing properly" — this box was sized 150x28 (aspect 5.35)
  // for the OLD wide wordmark logo.png; salary-slip-logo.png (the actual
  // file loaded here) is 353x168 (aspect ~2.1, much closer to square), and
  // @react-pdf/renderer's default objectFit is "fill" — it stretches the
  // source to EXACTLY the given width/height with no aspect-ratio
  // correction, so the sine-wave mark was being squashed flat. Sized to
  // its real aspect ratio and objectFit:"contain" added as a safety net
  // against this ever silently recurring if the logo file changes again.
  logo: { width: 95, height: 95 / (353 / 168), objectFit: "contain" },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontSize: 13, fontWeight: 700, color: ACCENT_DARK },
  companyLine: { fontSize: 7.5, color: MUTED, marginTop: 1, textAlign: "right" },
  headerDivider: { marginTop: 6, marginBottom: 8, borderBottomWidth: 2, borderColor: ACCENT },

  titleBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f0f1fd",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  titleBarLabel: { fontSize: 7.5, color: MUTED },
  titleBarValue: { fontSize: 12, fontWeight: 700, color: ACCENT_DARK, marginTop: 1 },

  sectionTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    color: ACCENT_DARK,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  infoCell: { width: "50%", marginBottom: 8 },
  infoLabel: { fontSize: 7.5, color: MUTED },
  infoValue: { fontSize: 10, fontWeight: 700, marginTop: 1 },

  moneyTables: { flexDirection: "row", gap: 12, marginBottom: 2 },
  moneyCol: { flex: 1 },
  moneyHeaderRow: {
    flexDirection: "row",
    backgroundColor: ACCENT,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  moneyHeaderLabel: { color: "#fff", fontSize: 9, fontWeight: 700, flex: 1 },
  moneyHeaderValue: { color: "#fff", fontSize: 9, fontWeight: 700, width: 70, textAlign: "right" },
  moneyRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  moneyRowLabel: { flex: 1, fontSize: 9 },
  moneyRowValue: { width: 70, textAlign: "right", fontSize: 9 },
  moneyTotalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f7f7fb",
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  moneyTotalLabel: { flex: 1, fontSize: 9, fontWeight: 700 },
  moneyTotalValue: { width: 70, textAlign: "right", fontSize: 9, fontWeight: 700 },

  payoutBar: {
    marginTop: 12,
    marginBottom: 6,
    backgroundColor: ACCENT_DARK,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  payoutLabel: { color: "#fff", fontSize: 10, fontWeight: 700 },
  payoutValue: { color: "#fff", fontSize: 14, fontWeight: 700 },
  amountInWords: { fontSize: 8.5, color: MUTED, marginBottom: 16, textAlign: "right" },

  leaveTable: { marginBottom: 18 },
  leaveHeaderRow: { flexDirection: "row", backgroundColor: "#f0f1fd", paddingVertical: 5, paddingHorizontal: 8 },
  leaveRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: BORDER },
  leaveCellCategory: { width: "22%", fontSize: 8.5, fontWeight: 700 },
  leaveCellCategoryHeader: { width: "22%", fontSize: 7.5, color: MUTED, fontWeight: 700 },
  leaveCell: { width: "26%", fontSize: 8.5 },
  leaveCellHeader: { width: "26%", fontSize: 7.5, color: MUTED, fontWeight: 700 },

  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 12 },
  signBlock: { width: "48%" },
  signLabel: { fontSize: 7.5, color: MUTED, marginBottom: 10 },
  signName: { fontSize: 12, fontWeight: 700, fontStyle: "italic", color: ACCENT_DARK },
  signDigital: { fontSize: 6.5, color: MUTED, marginTop: 3, lineHeight: 1.4 },
  signTitle: { fontSize: 8.5, marginTop: 8 },

  divider: { borderBottomWidth: 1, borderColor: BORDER, marginVertical: 8 },

  ackTitle: { fontSize: 10, fontWeight: 700, color: ACCENT_DARK, marginBottom: 8 },
  ackBody: { fontSize: 9, lineHeight: 1.5, marginBottom: 10 },
  ackSignRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  ackEmployeeName: { fontSize: 10, fontWeight: 700 },
  ackPlaceDate: { fontSize: 8.5, color: MUTED, textAlign: "right" },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 7,
    color: MUTED,
    textAlign: "center",
    borderTopWidth: 1,
    borderColor: BORDER,
    paddingTop: 6,
  },
});

function fmt(n: number): string {
  return formatIndianNumber(n || 0);
}

export interface SalarySlipDocumentProps {
  employeeName: string;
  location: string;
  roleTitle: string;
  dateOfJoining: string;
  month: string;
  slipType: string;
  earnings: SalarySlipEarnings;
  deductions: SalarySlipDeductions;
  leaveRows: SalarySlipLeaveRow[];
  leaveBalanceAsOn: string;
  authorizedName: string;
  authorizedTitle: string;
  ackPlace: string;
  generatedAtIso: string;
  /** A "data:image/png;base64,..." URI — @react-pdf/renderer's Node image
   * loader calls the global fetch() on any plain string src, which rejects
   * a filesystem path outright ("Only absolute URLs are supported"), so
   * the logo has to travel as inline data rather than a path. */
  logoDataUri: string;
}

export function SalarySlipDocument({
  employeeName,
  location,
  roleTitle,
  dateOfJoining,
  month,
  slipType,
  earnings,
  deductions,
  leaveRows,
  leaveBalanceAsOn,
  authorizedName,
  authorizedTitle,
  ackPlace,
  generatedAtIso,
  logoDataUri,
}: SalarySlipDocumentProps) {
  const earn = totalEarnings(earnings);
  const ded = totalDeductions(deductions);
  const payout = totalPayout(earnings, deductions);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img; it has no alt prop */}
          <Image src={logoDataUri} style={styles.logo} />
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>ECO Matrix Solutions</Text>
            <Text style={styles.companyLine}>101, Plot # 89, Himalaya Classic, Shivaji Nagar, Nagpur - 440010</Text>
            <Text style={styles.companyLine}>+919322737166 · anup@ecomatrix.io · ecomatrix.io</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />

        <View style={styles.titleBar}>
          <View>
            <Text style={styles.titleBarLabel}>Salary Slip for the month of</Text>
            <Text style={styles.titleBarValue}>{monthLabel(month)}</Text>
          </View>
          <View>
            <Text style={styles.titleBarLabel}>Type</Text>
            <Text style={[styles.titleBarValue, { textAlign: "right" }]}>{slipType}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Employee Information</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Employee Name</Text>
            <Text style={styles.infoValue}>{employeeName}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{roleTitle}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue}>{location}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Date of Joining</Text>
            <Text style={styles.infoValue}>{formatLongDate(dateOfJoining)}</Text>
          </View>
        </View>

        <View style={styles.moneyTables}>
          <View style={styles.moneyCol}>
            <View style={styles.moneyHeaderRow}>
              <Text style={styles.moneyHeaderLabel}>Earnings</Text>
              <Text style={styles.moneyHeaderValue}>INR</Text>
            </View>
            <View style={styles.moneyRow}>
              <Text style={styles.moneyRowLabel}>Basic</Text>
              <Text style={styles.moneyRowValue}>{fmt(earnings.basic)}</Text>
            </View>
            <View style={styles.moneyRow}>
              <Text style={styles.moneyRowLabel}>HRA</Text>
              <Text style={styles.moneyRowValue}>{fmt(earnings.hra)}</Text>
            </View>
            <View style={styles.moneyRow}>
              <Text style={styles.moneyRowLabel}>Shift Allowance</Text>
              <Text style={styles.moneyRowValue}>{fmt(earnings.shiftAllowance)}</Text>
            </View>
            <View style={[styles.moneyRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.moneyRowLabel}>Leave Encashment</Text>
              <Text style={styles.moneyRowValue}>{fmt(earnings.leaveEncashment)}</Text>
            </View>
            <View style={styles.moneyTotalRow}>
              <Text style={styles.moneyTotalLabel}>Total Earnings</Text>
              <Text style={styles.moneyTotalValue}>{fmt(earn)}</Text>
            </View>
          </View>

          <View style={styles.moneyCol}>
            <View style={styles.moneyHeaderRow}>
              <Text style={styles.moneyHeaderLabel}>Deductions</Text>
              <Text style={styles.moneyHeaderValue}>INR</Text>
            </View>
            <View style={styles.moneyRow}>
              <Text style={styles.moneyRowLabel}>Leave without Pay</Text>
              <Text style={styles.moneyRowValue}>{fmt(deductions.leaveWithoutPay)}</Text>
            </View>
            <View style={styles.moneyRow}>
              <Text style={styles.moneyRowLabel}>TDS</Text>
              <Text style={styles.moneyRowValue}>{fmt(deductions.tds)}</Text>
            </View>
            <View style={[styles.moneyRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.moneyRowLabel}>Profession Tax</Text>
              <Text style={styles.moneyRowValue}>{fmt(deductions.professionTax)}</Text>
            </View>
            <View style={[styles.moneyRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.moneyRowLabel}> </Text>
              <Text style={styles.moneyRowValue}> </Text>
            </View>
            <View style={styles.moneyTotalRow}>
              <Text style={styles.moneyTotalLabel}>Total Deductions</Text>
              <Text style={styles.moneyTotalValue}>{fmt(ded)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.payoutBar}>
          <Text style={styles.payoutLabel}>Total Payout</Text>
          <Text style={styles.payoutValue}>INR {fmt(payout)}</Text>
        </View>
        <Text style={styles.amountInWords}>{amountInWords(payout)}</Text>

        <Text style={styles.sectionTitle}>Leave Details</Text>
        <View style={styles.leaveTable}>
          <View style={styles.leaveHeaderRow}>
            <Text style={styles.leaveCellCategoryHeader}>Leave Category</Text>
            <Text style={styles.leaveCellHeader}>Opening Balance</Text>
            <Text style={styles.leaveCellHeader}>Availed Leave</Text>
            <Text style={styles.leaveCellHeader}>Leave Balance as on{"\n"}{formatLongDate(leaveBalanceAsOn)}</Text>
          </View>
          {leaveRows.map((row, i) => (
            <View style={styles.leaveRow} key={i}>
              <Text style={styles.leaveCellCategory}>{row.category}</Text>
              <Text style={styles.leaveCell}>{row.opening || "-"}</Text>
              <Text style={styles.leaveCell}>{row.availed || "-"}</Text>
              <Text style={styles.leaveCell}>{row.balance || "-"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.signRow}>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Authorized by:</Text>
            <Text style={styles.signName}>{authorizedName}</Text>
            <Text style={styles.signDigital}>
              Digitally signed by {authorizedName.replace(/^Mr\.?\s*|^Ms\.?\s*|^Mrs\.?\s*/i, "").toUpperCase()}
              {"\n"}Date: {formatIstTimestamp(new Date(generatedAtIso))}
            </Text>
            <Text style={styles.signTitle}>{authorizedName}</Text>
            <Text style={[styles.signTitle, { marginTop: 0, color: MUTED }]}>{authorizedTitle}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.ackTitle}>Acknowledgement</Text>
        <Text style={styles.ackBody}>
          I hereby acknowledge that I have fully received the {slipType} for {monthLabel(month)} (as calculated
          above) of INR {fmt(payout)} ({amountInWords(payout)}) on {formatLongDate(leaveBalanceAsOn)}.
        </Text>
        <View style={styles.ackSignRow}>
          <Text style={styles.ackEmployeeName}>{employeeName}</Text>
          <Text style={styles.ackPlaceDate}>
            Place: {ackPlace}
            {"\n"}Date: {monthYearLabel(month)}.
          </Text>
        </View>

        <Text style={styles.footer}>ECO Matrix Solutions - Confidential &amp; for Internal Use Only</Text>
      </Page>
    </Document>
  );
}
