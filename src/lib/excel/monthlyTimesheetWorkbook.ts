import "server-only";
import ExcelJS from "exceljs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllProjects, getAllUsers, toProjectMap, toUserMap } from "@/lib/data";
import { getDateInfoForMonth, MONTH_NAMES } from "@/lib/dateUtils";
import type { Project, PublicUser } from "@/lib/types";

/**
 * Rebuilds the "Monthly time" workbook Abeer previously had to assemble by
 * hand in Claude for every export: one row per project per employee (daily
 * hours across the month), rolled up into a Category/Project summary at the
 * top with a per-row reduction-factor column. See the project's sample
 * "Timesheet sample for Abeer.xlsx" for the template this mirrors.
 *
 * Scope note: only hours logged against a real project are included — this
 * is a project-chargeability sheet, not a leave/PTO report (the original
 * template has no PTO/Vacation rows either).
 *
 * IMPORTANT — why this does NOT use `project.project_type`:
 * every project migrated from the legacy MongoDB system was imported with
 * project_type hardcoded to "Energy Modelling" (see
 * scripts/import-mongo-to-supabase.cjs), and nothing in the admin UI has
 * gone back and corrected it since — confirmed live: all 190 projects in
 * production currently have project_type = "Energy Modelling", including
 * projects that are unambiguously BIM work (e.g. "Deer Lodge Centre",
 * "RBC Convention Centre"). That column is not a usable signal.
 *
 * The REAL signal is each entry's structured comment breakdown (see
 * CommentModal.tsx / COMMENT_CATEGORIES in lib/constants.ts) — confirmed
 * live: "Deer Lodge Centre" entries carry "BIM-CAD"/"BIM-REVIT" comment
 * categories directly, independent of the project's own (wrong) type.
 * So classification here is driven entirely by the comment category,
 * per-entry, regardless of project_type:
 *   - "BIM-CAD"                                           -> Cad
 *   - "BIM-REVIT"                                         -> Revit
 *   - "Geometry" / "Thermal Template" / "HVAC" /
 *     "Simulation & QA/QC" / "Reporting"                  -> Energy
 *   - "Other" (and any unrecognized/marketing category)   -> Other
 *   - no category at all (blank comment, or a breakdown
 *     item with no category field)                        -> inferred from
 *     whichever of Energy/Cad/Revit that SAME project earned the most
 *     hours in that month (e.g. a blank-comment hour on Deer Lodge Centre,
 *     which is ~98% BIM-CAD that month, is counted as Cad). Falls back to
 *     "Other" only if the project has no categorized hours at all to infer
 *     from. This is a judgment call, not a certainty — confirmed with
 *     Abeer that these aren't leave/PTO (project_id is always set) but
 *     real, just under-tagged, project work.
 * A single project can land in more than one section if different hours
 * on it were tagged differently (rare in practice, but real) — that's
 * intentional: the row key is (project, work type), not (project) alone.
 * "Other" gets its own section (not folded into Energy/BIM) because it's
 * an explicit tag for non-engineering time (meetings, reviews, admin) —
 * showing it separately is honest instead of guessing a discipline for it.
 *
 * The per-row reduction factor (% of hours written off before they count
 * toward a project's billable total) isn't tracked anywhere in the app — by
 * design (see conversation), every row is exported at 0% and left as a plain
 * editable cell. Because the summary section's day cells are formulas that
 * reference the employee rows below (`=(1-$C$42)*D42+...`), editing those
 * 0% cells in Excel after the fact still recalculates the whole sheet
 * correctly — exactly like the hand-built original.
 *
 * Each project also gets a deterministic fill color (hashed from its id,
 * so it's stable across months/regenerations) applied to its name cell
 * everywhere it appears — summary sections and every employee's rows —
 * mirroring the original template's per-project color coding so a project
 * can be visually traced across the whole sheet.
 *
 * Two export modes (see `buildMonthlyTimesheetWorkbook`'s `clientNames`
 * option): the default "consolidated" export is one sheet with every
 * project across every client; the "client-wise" export instead produces
 * one sheet per selected client (same workbook/file, one tab each), each
 * scoped to only that client's own projects and hours.
 */

type Bucket = "Energy" | "Cad" | "Revit" | "Other";

interface CommentBreakdownRow {
  hours?: number;
  category?: string;
}

interface RawEntry {
  employee_id: string;
  project_id: string | null;
  entry_date: string;
  hours: number | string | null;
  comment: string | null;
}

interface AggregatedRow {
  employeeId: string;
  projectId: string;
  bucket: Bucket;
  dailyHours: number[]; // index 0 = day 1
}

export interface MonthlyAggregation {
  year: number;
  month: number;
  daysInMonth: number;
  rows: AggregatedRow[];
}

const ENERGY_CATEGORIES = new Set(["Geometry", "Thermal Template", "HVAC", "Simulation & QA/QC", "Reporting"]);

function parseCommentBreakdown(comment: string | null): CommentBreakdownRow[] | null {
  const s = (comment ?? "").trim();
  if (!s.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Classifies an explicit, present category string. "unknown" means the
 * category field was missing/blank — not a bucket on its own, resolved
 * later by inferring from the project's own dominant bucket that month. */
function categoryKind(category: string | undefined): Bucket | "unknown" {
  if (category === "BIM-CAD") return "Cad";
  if (category === "BIM-REVIT") return "Revit";
  if (category && ENERGY_CATEGORIES.has(category)) return "Energy";
  if (category === "Other") return "Other";
  return "unknown";
}

/** Pure aggregation step — DB-independent, so it's unit-testable on its own. */
export function aggregateMonthlyTimesheet(
  year: number,
  month: number,
  entries: RawEntry[],
  projectMap: Record<string, Project>
): MonthlyAggregation {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rowMap = new Map<string, AggregatedRow>();

  function addHours(employeeId: string, projectId: string, bucket: Bucket, dayIndex: number, hours: number) {
    if (!hours) return;
    const key = `${employeeId}\u0000${projectId}\u0000${bucket}`;
    let row = rowMap.get(key);
    if (!row) {
      row = { employeeId, projectId, bucket, dailyHours: new Array(daysInMonth).fill(0) };
      rowMap.set(key, row);
    }
    row.dailyHours[dayIndex] += hours;
  }

  // Per-project Energy/Cad/Revit totals (explicit tags only, "Other"
  // excluded — it's never a sensible inference target) used below to
  // resolve entries/items that carry no category at all.
  const projectEngineeringHours: Record<string, Partial<Record<"Energy" | "Cad" | "Revit", number>>> = {};
  function bumpProjectBucket(projectId: string, bucket: Bucket, hours: number) {
    if (bucket === "Other") return;
    const m = projectEngineeringHours[projectId] ?? (projectEngineeringHours[projectId] = {});
    m[bucket] = (m[bucket] ?? 0) + hours;
  }

  const pending: { employeeId: string; projectId: string; dayIndex: number; hours: number }[] = [];

  for (const e of entries) {
    if (!e.project_id) continue;
    if (!projectMap[e.project_id]) continue; // project deleted since
    const hours = Number(e.hours ?? 0);
    if (!hours) continue;
    const dayIndex = Number(e.entry_date.slice(8, 10)) - 1;
    if (dayIndex < 0 || dayIndex >= daysInMonth) continue;

    const breakdown = parseCommentBreakdown(e.comment);
    if (!breakdown || breakdown.length === 0) {
      pending.push({ employeeId: e.employee_id, projectId: e.project_id, dayIndex, hours });
      continue;
    }
    // The breakdown's own hours are supposed to sum to the entry's `hours`
    // field exactly (the comment modal enforces this on save), but a small
    // number of real rows don't (an edit race, by the look of it — e.g. a
    // live Deer Lodge Centre entry logged 7.5h with a breakdown summing to
    // only 7.25h). Scale the breakdown proportionally to the entry's actual
    // `hours` so the category split never silently drops hours that every
    // other report in the app (CSV export, dashboards, reportData.ts) still
    // counts in full.
    const declaredTotal = breakdown.reduce((sum, item) => sum + Number(item?.hours ?? 0), 0);
    const scale = declaredTotal > 0 ? hours / declaredTotal : 0;
    for (const item of breakdown) {
      const itemHours = Number(item?.hours ?? 0) * scale;
      if (!itemHours) continue;
      const kind = categoryKind(item.category);
      if (kind === "unknown") {
        pending.push({ employeeId: e.employee_id, projectId: e.project_id, dayIndex, hours: itemHours });
        continue;
      }
      addHours(e.employee_id, e.project_id, kind, dayIndex, itemHours);
      bumpProjectBucket(e.project_id, kind, itemHours);
    }
  }

  // Resolve every uncategorized item into whichever of Energy/Cad/Revit its
  // own project earned the most hours in this month; if the project has no
  // categorized hours at all to infer from, it genuinely can't be guessed
  // and falls back to "Other".
  for (const p of pending) {
    const buckets = projectEngineeringHours[p.projectId];
    let inferred: Bucket = "Other";
    let bestHours = 0;
    if (buckets) {
      for (const b of ["Energy", "Cad", "Revit"] as const) {
        const h = buckets[b] ?? 0;
        if (h > bestHours) {
          bestHours = h;
          inferred = b;
        }
      }
    }
    addHours(p.employeeId, p.projectId, inferred, p.dayIndex, p.hours);
  }

  return { year, month, daysInMonth, rows: [...rowMap.values()] };
}

function columnLetter(n: number): string {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

const FONT_FAMILY = "Calibri";
const TITLE_FILL = "FFDCEEFA";
const TITLE_COLOR = "FF296487";
const LABEL_COLOR = "FF495057";
const WEEKEND_FILL = "FFE2E2E2";
const SUBTOTAL_FILL = "FFFFFF00";
const SECTION_HEADER_FILL = "FFF2F2F2";
const THIN = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const THIN_BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const BUCKET_ORDER: Record<Bucket, number> = { Energy: 0, Cad: 1, Revit: 2, Other: 3 };

function projectDisplayName(project: Project, bucket: Bucket): string {
  const base = `${project.project_number ? `${project.project_number} - ` : ""}${project.name}`;
  if (bucket === "Energy") return base;
  return `${base} (${bucket})`;
}

// Pastel palette for per-project color coding (mirrors the original
// template's manual row-coloring, but assigned automatically and
// deterministically so it's consistent every month without upkeep).
const PROJECT_COLOR_PALETTE = [
  "FFDDEBF7", "FFE2EFDA", "FFFCE4D6", "FFFFF2CC", "FFD9D2E9", "FFCFE2F3",
  "FFF4CCCC", "FFC6E0B4", "FFF8CBAD", "FFB4C7E7", "FFFFE699", "FFD5A6BD",
  "FFA9D18E", "FF9DC3E6", "FFF6B26B", "FFB6D7A8", "FFEAD1DC", "FFD9EAD3",
  "FFFCE5CD", "FFBFE1D9",
];

function colorForProject(projectId: string): string {
  let hash = 5381;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 33 + projectId.charCodeAt(i)) >>> 0;
  }
  return PROJECT_COLOR_PALETTE[hash % PROJECT_COLOR_PALETTE.length];
}

interface SummaryRowRef {
  projectId: string;
  bucket: Bucket;
  row: number;
}

// Excel worksheet names can't contain : \ / ? * [ ] and are capped at 31
// chars — used both for the default single-sheet name and for the one
// client-wise sheet per selected client.
const INVALID_SHEET_NAME_CHARS = /[:\\/?*[\]]/g;

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(INVALID_SHEET_NAME_CHARS, "-").trim();
  return (cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned) || "Sheet";
}

/** Dedupes sheet names (e.g. two clients that truncate to the same 31 chars). */
function uniqueSheetName(used: Set<string>, desired: string): string {
  const base = sanitizeSheetName(desired);
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = sanitizeSheetName(base.slice(0, 31 - suffix.length) + suffix);
    n++;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Pure render step — given the aggregated hours plus the project/employee
 * lookups, builds one worksheet. Kept separate from the DB fetch so the
 * formula/layout logic can be exercised with synthetic data in a test.
 *
 * Pass `opts.workbook` to append this sheet onto an existing workbook
 * (used for the client-wise export, which puts one sheet per selected
 * client into a single file) — otherwise a fresh workbook is created.
 */
export function renderMonthlyTimesheetWorkbook(
  aggregation: MonthlyAggregation,
  projects: Project[],
  users: PublicUser[],
  opts: { workbook?: ExcelJS.Workbook; sheetName?: string; clientLabel?: string } = {}
): ExcelJS.Workbook {
  const { year, month, daysInMonth, rows } = aggregation;
  const projectMap = toProjectMap(projects);
  const userMap = toUserMap(users);

  const FIRST_DAY_COL = 4; // D
  const lastDayCol = FIRST_DAY_COL + daysInMonth - 1;
  const totalCol = lastDayCol + 1;
  const woRednCol = lastDayCol + 2;
  const lastCol = woRednCol;
  const totalColLetter = columnLetter(totalCol);
  const woRednColLetter = columnLetter(woRednCol);
  const firstDayColLetter = columnLetter(FIRST_DAY_COL);
  const lastDayColLetter = columnLetter(lastDayCol);

  const dateInfo = getDateInfoForMonth(year, month);
  const dayLetter = (weekday: number) => ["M", "T", "W", "T", "F", "S", "S"][weekday];
  const isWeekendCol = (dayIndex: number) => dateInfo[dayIndex].weekday >= 5;

  const workbook = opts.workbook ?? new ExcelJS.Workbook();
  if (!opts.workbook) {
    workbook.creator = "Ecomatrix Timesheets";
    workbook.created = new Date();
  }
  const sheetName = sanitizeSheetName(opts.sheetName ?? `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`);
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 9 }],
  });

  ws.getColumn(1).width = 16; // Category
  ws.getColumn(2).width = 48; // Project Name/Number
  ws.getColumn(3).width = 11; // Redn Factor
  for (let c = FIRST_DAY_COL; c <= lastDayCol; c++) ws.getColumn(c).width = 5;
  ws.getColumn(totalCol).width = 10;
  ws.getColumn(woRednCol).width = 11;

  function setCell(
    row: number,
    col: number,
    value: ExcelJS.CellValue,
    opts: {
      bold?: boolean;
      italic?: boolean;
      color?: string;
      fill?: string;
      align?: "left" | "center" | "right";
      numFmt?: string;
      border?: boolean;
      size?: number;
    } = {}
  ) {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = {
      name: FONT_FAMILY,
      size: opts.size ?? 11,
      bold: opts.bold ?? false,
      italic: opts.italic ?? false,
      color: opts.color ? { argb: opts.color } : undefined,
    };
    if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    if (opts.align) cell.alignment = { horizontal: opts.align, vertical: "middle" };
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    if (opts.border) cell.border = THIN_BORDER;
    return cell;
  }

  function shadeWeekends(row: number, fromCol: number, toCol: number) {
    for (let c = fromCol; c <= toCol; c++) {
      const dayIndex = c - FIRST_DAY_COL;
      if (dayIndex >= 0 && dayIndex < daysInMonth && isWeekendCol(dayIndex)) {
        const cell = ws.getCell(row, c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WEEKEND_FILL } };
      }
    }
  }

  // ---- Title ----
  ws.mergeCells(1, 2, 1, Math.min(lastCol, 9));
  const titleText = opts.clientLabel
    ? `Monthly Timesheet — ${opts.clientLabel} — ${MONTH_NAMES[month - 1]} ${year}`
    : `Monthly Timesheet — ${MONTH_NAMES[month - 1]} ${year}`;
  setCell(1, 2, titleText, {
    bold: true,
    size: 14,
    color: TITLE_COLOR,
    fill: TITLE_FILL,
    align: "center",
  });
  ws.getRow(1).height = 22;

  setCell(3, 2, "Name:", { bold: true, size: 9, color: LABEL_COLOR, align: "left" });
  setCell(4, 2, opts.clientLabel ? `Client: ${opts.clientLabel}` : "Client:", {
    bold: true,
    size: 9,
    color: LABEL_COLOR,
    align: "left",
  });

  // ---- Weekday / date header ----
  const weekdayRow = 6;
  const dateRow = 7;
  setCell(dateRow, 2, `Dates in ${MONTH_NAMES[month - 1]} ${year}`, { align: "left" });
  for (let d = 0; d < daysInMonth; d++) {
    const col = FIRST_DAY_COL + d;
    setCell(weekdayRow, col, dayLetter(dateInfo[d].weekday), { align: "center", border: true });
    setCell(dateRow, col, d + 1, { align: "center", border: true });
  }
  shadeWeekends(weekdayRow, FIRST_DAY_COL, lastDayCol);
  shadeWeekends(dateRow, FIRST_DAY_COL, lastDayCol);

  // ============================================================
  // Lay out the three summary sections (Energy / BIM / Other)
  // top-to-bottom first — their row count depends only on `rows`, not on
  // the employee section below, which is written next. The summary
  // formulas themselves (which reference employee rows) are filled in
  // afterward, once those employee row numbers are known.
  // ============================================================

  function uniqueProjectBucketList(buckets: Set<Bucket>): { projectId: string; bucket: Bucket }[] {
    const seen = new Set<string>();
    const list: { projectId: string; bucket: Bucket }[] = [];
    for (const r of rows) {
      if (!buckets.has(r.bucket)) continue;
      const key = `${r.projectId}\u0000${r.bucket}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ projectId: r.projectId, bucket: r.bucket });
    }
    list.sort((a, b) => {
      const nameCompare = (projectMap[a.projectId]?.name ?? "").localeCompare(projectMap[b.projectId]?.name ?? "");
      if (nameCompare !== 0) return nameCompare;
      return BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
    });
    return list;
  }

  let cursor = 9; // row 9 = "Category" / "Project Name/Number" header

  function placeSummaryRows(list: { projectId: string; bucket: Bucket }[]): SummaryRowRef[] {
    const result: SummaryRowRef[] = [];
    for (const { projectId, bucket } of list) {
      const project = projectMap[projectId];
      setCell(cursor, 1, bucket, { align: "center" });
      setCell(cursor, 2, projectDisplayName(project, bucket), { border: true, fill: colorForProject(projectId) });
      result.push({ projectId, bucket, row: cursor });
      cursor++;
    }
    return result;
  }

  function placeTotalHoursRow(hasRows: boolean): number | null {
    if (!hasRows) return null;
    const row = cursor;
    setCell(row, 2, "Total Hours", { bold: true });
    cursor++;
    return row;
  }

  setCell(cursor, 1, "Category", { bold: true, align: "center" });
  setCell(cursor, 2, "Project Name/Number", { bold: true, align: "left", border: true });
  setCell(cursor, totalCol, "Total (with Redn)", { align: "center", bold: true });
  setCell(cursor, woRednCol, "w/o redn", { align: "center", bold: true, color: "FFFF0000" });
  cursor++;

  const energyList = uniqueProjectBucketList(new Set(["Energy"]));
  const energySummaryRows = placeSummaryRows(energyList);
  const energyTotalRow = placeTotalHoursRow(energyList.length > 0);
  cursor++; // blank spacer

  const bimHeaderRow = cursor;
  setCell(bimHeaderRow, 2, "BIM PROJECTS", { bold: true, fill: SECTION_HEADER_FILL });
  setCell(bimHeaderRow, totalCol, "Total (with Redn)", { align: "center", bold: true, fill: SECTION_HEADER_FILL });
  setCell(bimHeaderRow, woRednCol, "w/o redn", { align: "center", bold: true, color: "FFFF0000", fill: SECTION_HEADER_FILL });
  cursor++;
  const bimList = uniqueProjectBucketList(new Set(["Cad", "Revit"]));
  const bimSummaryRows = placeSummaryRows(bimList);
  const bimTotalRow = placeTotalHoursRow(bimList.length > 0);
  cursor++; // blank spacer

  // Explicit "Other" category — non-engineering project time (meetings,
  // reviews, client discussions, admin) that an employee deliberately
  // tagged as not Energy or BIM work. Kept separate rather than guessed
  // into either discipline. See module doc comment above.
  const otherHeaderRow = cursor;
  setCell(otherHeaderRow, 2, "OTHER / NON-ENGINEERING HOURS (meetings, reviews, admin — logged as \"Other\")", { bold: true, fill: SECTION_HEADER_FILL });
  setCell(otherHeaderRow, totalCol, "Total (with Redn)", { align: "center", bold: true, fill: SECTION_HEADER_FILL });
  setCell(otherHeaderRow, woRednCol, "w/o redn", { align: "center", bold: true, color: "FFFF0000", fill: SECTION_HEADER_FILL });
  cursor++;
  const otherList = uniqueProjectBucketList(new Set(["Other"]));
  const otherSummaryRows = placeSummaryRows(otherList);
  const otherTotalRow = placeTotalHoursRow(otherList.length > 0);
  cursor++; // blank spacer

  let check1Row: number | null = null;
  let check2Row: number | null = null;
  if (bimTotalRow) {
    check1Row = cursor;
    setCell(check1Row, 2, "Check: BIM (Cad+Revit) hours from employee sections match BIM total (w/o redn)", { italic: true });
    cursor++;
  }
  if (energyTotalRow || bimTotalRow || otherTotalRow) {
    check2Row = cursor;
    setCell(check2Row, 2, "Check: all employee hours match Energy + BIM + Other (w/o redn) — should be 0", { italic: true });
    cursor++;
  }
  cursor++; // blank spacer before employee section

  // ============================================================
  // Employee detail section
  // ============================================================

  const employeeIdsWithRows = [...new Set(rows.map((r) => r.employeeId))];
  const employeesWithData = employeeIdsWithRows
    .map((id) => userMap[id])
    .filter((u): u is PublicUser => !!u)
    .sort((a, b) => a.name.localeCompare(b.name));

  function sortedRowsFor(employeeId: string): AggregatedRow[] {
    return rows
      .filter((r) => r.employeeId === employeeId)
      .sort((a, b) => {
        const pa = projectMap[a.projectId];
        const pb = projectMap[b.projectId];
        const nameCompare = (pa?.name ?? "").localeCompare(pb?.name ?? "");
        if (nameCompare !== 0) return nameCompare;
        return BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
      });
  }

  interface PlannedEmployeeRow {
    employeeId: string;
    sheetRow: number;
    data: AggregatedRow;
  }
  interface PlannedEmployeeBlock {
    employee: PublicUser;
    nameRow: number;
    firstDataRow: number;
    lastDataRow: number;
    subtotalRow: number;
    hasBim: boolean;
  }

  const employeeBlocks: PlannedEmployeeBlock[] = [];
  const employeeRowEntries: PlannedEmployeeRow[] = [];

  for (const employee of employeesWithData) {
    const empRows = sortedRowsFor(employee.id);
    if (empRows.length === 0) continue;

    const nameRow = cursor;
    setCell(nameRow, 2, employee.name, { bold: true });
    setCell(nameRow, 3, "Redn Factor", { italic: true, size: 9, align: "center" });
    cursor++;

    const firstDataRow = cursor;
    let hasBim = false;
    for (const r of empRows) {
      const project = projectMap[r.projectId];
      setCell(cursor, 1, r.bucket, { align: "center" });
      setCell(cursor, 2, projectDisplayName(project, r.bucket), { border: true, fill: colorForProject(r.projectId) });
      setCell(cursor, 3, 0, { align: "center", numFmt: "0%" });
      for (let d = 0; d < daysInMonth; d++) {
        const hours = r.dailyHours[d];
        setCell(cursor, FIRST_DAY_COL + d, hours === 0 ? null : hours, { align: "center", border: true, numFmt: "0.##" });
      }
      shadeWeekends(cursor, FIRST_DAY_COL, lastDayCol);
      setCell(
        cursor,
        totalCol,
        { formula: `SUM(${firstDayColLetter}${cursor}:${lastDayColLetter}${cursor})` },
        { align: "center", border: true, numFmt: "0.00" }
      );
      employeeRowEntries.push({ employeeId: employee.id, sheetRow: cursor, data: r });
      if (r.bucket === "Cad" || r.bucket === "Revit") hasBim = true;
      cursor++;
    }
    const lastDataRow = cursor - 1;

    const subtotalRow = cursor;
    setCell(subtotalRow, 2, "Subtotal", { bold: true });
    setCell(
      subtotalRow,
      totalCol,
      { formula: `SUM(${totalColLetter}${firstDataRow}:${totalColLetter}${lastDataRow})` },
      { align: "center", bold: true, fill: SUBTOTAL_FILL, numFmt: "0.00" }
    );
    if (hasBim) {
      const criteriaRange = `A${firstDataRow}:A${lastDataRow}`;
      const sumRange = `${totalColLetter}${firstDataRow}:${totalColLetter}${lastDataRow}`;
      setCell(
        subtotalRow,
        woRednCol,
        { formula: `SUMIF(${criteriaRange},"Cad",${sumRange})+SUMIF(${criteriaRange},"Revit",${sumRange})` },
        { align: "center", bold: true, fill: SUBTOTAL_FILL, numFmt: "0.00" }
      );
    }
    cursor++;

    employeeBlocks.push({ employee, nameRow, firstDataRow, lastDataRow, subtotalRow, hasBim });
    cursor++; // blank spacer between employees
  }

  // ---- Now that employee rows are known, fill in the summary formulas ----

  function writeSummaryRow(row: number, projectId: string, bucket: Bucket) {
    const contributing = employeeRowEntries.filter((e) => e.data.projectId === projectId && e.data.bucket === bucket);
    for (let d = 0; d < daysInMonth; d++) {
      const col = FIRST_DAY_COL + d;
      const colLetter = columnLetter(col);
      const terms = contributing.map((e) => `(1-$C$${e.sheetRow})*${colLetter}${e.sheetRow}`);
      setCell(row, col, terms.length > 0 ? { formula: terms.join("+") } : 0, {
        align: "center",
        border: true,
        numFmt: "0.##",
      });
    }
    shadeWeekends(row, FIRST_DAY_COL, lastDayCol);
    setCell(row, totalCol, { formula: `SUM(${firstDayColLetter}${row}:${lastDayColLetter}${row})` }, { align: "center", border: true, numFmt: "0.00" });
    const rawTotalTerms = contributing.map((e) => `${totalColLetter}${e.sheetRow}`);
    setCell(row, woRednCol, rawTotalTerms.length > 0 ? { formula: rawTotalTerms.join("+") } : 0, {
      align: "center",
      border: true,
      numFmt: "0.00",
    });
  }

  function fillSectionTotalFormulas(summaryRows: SummaryRowRef[], totalRow: number | null) {
    for (const { projectId, bucket, row } of summaryRows) writeSummaryRow(row, projectId, bucket);
    if (!totalRow || summaryRows.length === 0) return;
    const first = summaryRows[0].row;
    const last = summaryRows[summaryRows.length - 1].row;
    for (let d = 0; d < daysInMonth; d++) {
      const col = FIRST_DAY_COL + d;
      const colLetter = columnLetter(col);
      setCell(totalRow, col, { formula: `SUM(${colLetter}${first}:${colLetter}${last})` }, { align: "center", bold: true, numFmt: "0.##" });
    }
    shadeWeekends(totalRow, FIRST_DAY_COL, lastDayCol);
    setCell(totalRow, totalCol, { formula: `SUM(${totalColLetter}${first}:${totalColLetter}${last})` }, { align: "center", bold: true, numFmt: "0.00" });
    setCell(totalRow, woRednCol, { formula: `SUM(${woRednColLetter}${first}:${woRednColLetter}${last})` }, { align: "center", bold: true, numFmt: "0.00" });
  }

  fillSectionTotalFormulas(energySummaryRows, energyTotalRow);
  fillSectionTotalFormulas(bimSummaryRows, bimTotalRow);
  fillSectionTotalFormulas(otherSummaryRows, otherTotalRow);

  if (check1Row && bimTotalRow) {
    const bimEmployeeSubtotals = employeeBlocks.filter((b) => b.hasBim).map((b) => `${woRednColLetter}${b.subtotalRow}`);
    setCell(check1Row, woRednCol, bimEmployeeSubtotals.length > 0 ? { formula: bimEmployeeSubtotals.join("+") } : 0, {
      align: "center",
      numFmt: "0.00",
    });
  }
  if (check2Row) {
    const allSubtotals = employeeBlocks.map((b) => `${totalColLetter}${b.subtotalRow}`);
    const minusTerms: string[] = [];
    if (energyTotalRow) minusTerms.push(`-${woRednColLetter}${energyTotalRow}`);
    if (bimTotalRow) minusTerms.push(`-${woRednColLetter}${bimTotalRow}`);
    if (otherTotalRow) minusTerms.push(`-${woRednColLetter}${otherTotalRow}`);
    const formula = `(${allSubtotals.join("+")})${minusTerms.join("")}`;
    setCell(check2Row, woRednCol, allSubtotals.length > 0 ? { formula } : 0, { align: "center", numFmt: "0.00" });
  }

  ws.getRow(9).height = 18;
  ws.getRow(bimHeaderRow).height = 18;
  ws.getRow(otherHeaderRow).height = 18;

  return workbook;
}

async function fetchMonthEntries(year: number, month: number): Promise<RawEntry[]> {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthStr = String(month).padStart(2, "0");
  const dateFrom = `${year}-${monthStr}-01`;
  const dateTo = `${year}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  const { data, error } = await supabaseAdmin
    .from("timesheet_entries")
    .select("employee_id, project_id, entry_date, hours, comment")
    .gte("entry_date", dateFrom)
    .lte("entry_date", dateTo)
    .not("project_id", "is", null);
  if (error) throw error;
  return (data ?? []) as RawEntry[];
}

/**
 * `options.clientNames`, when given one or more client names (as they
 * appear in `projects.client_name`), switches from the default consolidated
 * single sheet (all projects together) to a client-wise export: one
 * worksheet per selected client, each scoped to only that client's
 * projects/hours, all inside the same workbook/file.
 */
export async function buildMonthlyTimesheetWorkbook(
  year: number,
  month: number,
  options: { clientNames?: string[] } = {}
): Promise<ExcelJS.Workbook> {
  const [projects, users, entries] = await Promise.all([getAllProjects(), getAllUsers(), fetchMonthEntries(year, month)]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ecomatrix Timesheets";
  workbook.created = new Date();

  const clientNames = [...new Set((options.clientNames ?? []).map((c) => c.trim()).filter(Boolean))];

  if (clientNames.length === 0) {
    const projectMap = toProjectMap(projects);
    const aggregation = aggregateMonthlyTimesheet(year, month, entries, projectMap);
    renderMonthlyTimesheetWorkbook(aggregation, projects, users, { workbook });
    return workbook;
  }

  const usedSheetNames = new Set<string>();
  for (const clientName of clientNames) {
    const clientProjects = projects.filter((p) => p.client_name === clientName);
    const clientProjectIds = new Set(clientProjects.map((p) => p.id));
    const clientEntries = entries.filter((e) => e.project_id && clientProjectIds.has(e.project_id));
    const projectMap = toProjectMap(clientProjects);
    const aggregation = aggregateMonthlyTimesheet(year, month, clientEntries, projectMap);
    const sheetName = uniqueSheetName(usedSheetNames, clientName);
    renderMonthlyTimesheetWorkbook(aggregation, clientProjects, users, {
      workbook,
      sheetName,
      clientLabel: clientName,
    });
  }
  return workbook;
}
