"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canSubmitDay, isWeekUnlocked } from "@/lib/timesheetMath";
import { isWeekend, getPrecedingWeekdays } from "@/lib/dateUtils";

/**
 * Server-side check for the "finish last week before starting a new one"
 * gate — queries only the 5 specific preceding weekdays (which may span
 * into the previous month) rather than assuming they fall in the same
 * month as `dateStr`.
 */
async function checkWeekUnlocked(employeeId: string, dateStr: string): Promise<boolean> {
  if (isWeekend(dateStr)) return true;
  const priorWeekdays = getPrecedingWeekdays(dateStr);
  const { data: submitted, error } = await supabaseAdmin
    .from("submitted_days")
    .select("entry_date")
    .eq("employee_id", employeeId)
    .in("entry_date", priorWeekdays);
  if (error) throw error;
  return isWeekUnlocked(dateStr, new Set((submitted ?? []).map((s) => s.entry_date)));
}

export interface CellTarget {
  projectId: string | null; // exactly one of projectId/category is set
  category: string | null;
}

export interface UpdateCellResult {
  success: boolean;
  error?: string;
}

/**
 * Mirrors v1's /timesheet/update — upserts a single cell (hours + comment)
 * for the current user on a given date, matching on (employee, date,
 * project_id) or (employee, date, category) depending on which is set.
 */
export async function updateTimesheetCellAction(
  target: CellTarget,
  dateStr: string,
  hours: number,
  comment: string
): Promise<UpdateCellResult> {
  const session = await requireSession();

  if (!target.projectId && !target.category) {
    return { success: false, error: "No project or category specified." };
  }

  // Check if the day is locked (submitted) before allowing an edit.
  const { data: locked } = await supabaseAdmin
    .from("submitted_days")
    .select("id")
    .eq("employee_id", session.userId)
    .eq("entry_date", dateStr)
    .maybeSingle();
  if (locked) {
    return { success: false, error: "This day is locked and cannot be edited." };
  }

  if (!(await checkWeekUnlocked(session.userId, dateStr))) {
    return {
      success: false,
      error: "You must fully submit last week (Mon-Fri) before entering hours for this week.",
    };
  }

  const matchColumn = target.projectId ? "project_id" : "category";
  const matchValue = target.projectId ?? target.category;

  const { data: existing } = await supabaseAdmin
    .from("timesheet_entries")
    .select("id")
    .eq("employee_id", session.userId)
    .eq("entry_date", dateStr)
    .eq(matchColumn, matchValue as string)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin
      .from("timesheet_entries")
      .update({ hours, comment })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabaseAdmin.from("timesheet_entries").insert({
      employee_id: session.userId,
      entry_date: dateStr,
      hours,
      comment,
      project_id: target.projectId,
      category: target.category,
    });
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/timesheet");
  return { success: true };
}

export interface SubmitDayResult {
  success: boolean;
  error?: string;
}

/**
 * Mirrors v1's /timesheet/submit_day: weekday requires >=7.75 total hours
 * (excluding 'Overtime Logged'); weekend has no minimum. Writes a
 * submitted_days row that locks the day.
 */
export async function submitDayAction(dateStr: string): Promise<SubmitDayResult> {
  const session = await requireSession();

  const { data: already } = await supabaseAdmin
    .from("submitted_days")
    .select("id")
    .eq("employee_id", session.userId)
    .eq("entry_date", dateStr)
    .maybeSingle();
  if (already) {
    return { success: false, error: "Day already submitted" };
  }

  if (!(await checkWeekUnlocked(session.userId, dateStr))) {
    return {
      success: false,
      error: "You must fully submit last week (Mon-Fri) before submitting this week.",
    };
  }

  const { data: entries, error: entriesError } = await supabaseAdmin
    .from("timesheet_entries")
    .select("hours, category, project_id, comment")
    .eq("employee_id", session.userId)
    .eq("entry_date", dateStr);
  if (entriesError) return { success: false, error: entriesError.message };

  const totalExcludingOvertimeLogged = (entries ?? [])
    .filter((e) => e.category !== "Overtime Logged")
    .reduce((sum, e) => sum + Number(e.hours ?? 0), 0);

  const check = canSubmitDay(dateStr, totalExcludingOvertimeLogged);
  if (!check.ok) {
    return { success: false, error: check.reason };
  }

  // Mirrors v1's second server-side check (weekdays only, exactly like the
  // 7.75 check above): every REAL PROJECT row with hours > 0 must have a
  // non-empty saved comment. A comment of '[]' (an emptied structured
  // breakdown) counts as missing, same as v1. Categories are exempt.
  if (!isWeekend(dateStr)) {
    for (const e of entries ?? []) {
      if (!e.project_id) continue; // categories don't require a comment
      const hours = Number(e.hours ?? 0);
      if (hours <= 0) continue;
      const comment = (e.comment ?? "").trim();
      if (!comment || comment === "[]") {
        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("name")
          .eq("id", e.project_id)
          .maybeSingle();
        const projectName = project?.name ?? "Unknown Project";
        return {
          success: false,
          error: `A comment is mandatory for project '${projectName}' which has hours logged.`,
        };
      }
    }
  }

  const totalHours = (entries ?? []).reduce((sum, e) => sum + Number(e.hours ?? 0), 0);
  const entriesSnapshot: Record<string, { hours: number; comment: string | null }> = {};
  for (const e of entries ?? []) {
    const key = e.project_id ?? e.category ?? "unknown";
    entriesSnapshot[key] = { hours: Number(e.hours ?? 0), comment: e.comment };
  }

  const { error } = await supabaseAdmin.from("submitted_days").insert({
    employee_id: session.userId,
    entry_date: dateStr,
    total_hours: totalHours,
    entries_data: entriesSnapshot,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/timesheet");
  return { success: true };
}

/** Admin action: unlock a submitted day by deleting its submitted_days row. */
export async function reopenDayAction(employeeId: string, dateStr: string) {
  await requireAdmin();
  const { error } = await supabaseAdmin
    .from("submitted_days")
    .delete()
    .eq("employee_id", employeeId)
    .eq("entry_date", dateStr);
  if (error) throw error;
  revalidatePath("/reports");
  revalidatePath("/admin/timesheet_view");
}

/**
 * Mirrors v1's /timesheet/add_project_row: when an employee picks a
 * project from one of the Timesheet page's two grouped dropdowns (Energy
 * Modelling / BIM and AutoCad), this adds a visible row for that project
 * to the grid by inserting a 0-hour placeholder entry on the first day of
 * the currently-viewed month — the same "add a row on demand" mechanic
 * v1 used, just via a Server Action instead of a raw fetch() to a route.
 * A no-op if the project already has an entry that month (mirrors v1's
 * addedProjects de-dupe check).
 */
export async function addProjectRowAction(projectId: string, firstDateOfMonth: string) {
  const session = await requireSession();

  if (!(await checkWeekUnlocked(session.userId, firstDateOfMonth))) {
    return {
      success: false,
      error: "You must fully submit last week (Mon-Fri) before entering hours for this week.",
    };
  }

  const { data: existing } = await supabaseAdmin
    .from("timesheet_entries")
    .select("id")
    .eq("employee_id", session.userId)
    .eq("project_id", projectId)
    .gte("entry_date", firstDateOfMonth)
    .lte("entry_date", firstDateOfMonth.slice(0, 7) + "-31")
    .limit(1)
    .maybeSingle();
  if (existing) return { success: true };

  const { error } = await supabaseAdmin.from("timesheet_entries").insert({
    employee_id: session.userId,
    entry_date: firstDateOfMonth,
    project_id: projectId,
    category: null,
    hours: 0,
    comment: "",
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/timesheet");
  return { success: true };
}

/**
 * Mirrors v1's row-level "Add a comment for this project" text box (the
 * plain input at the end of each project row, separate from the per-day
 * "C" comment button) — with one deliberate fix.
 *
 * v1's updateComment() finds the first day in the row with hours > 0 and
 * overwrites THAT entry's comment while forcing hours to 0 — a real bug
 * that can silently zero out logged hours if it lands on the wrong day.
 * This version only ever touches the `comment` column; hours are never
 * modified on any existing entry.
 */
export async function updateRowCommentAction(
  projectId: string,
  monthFirstDate: string,
  comment: string
): Promise<UpdateCellResult> {
  const session = await requireSession();

  const monthPrefix = monthFirstDate.slice(0, 7);
  const { data: entries } = await supabaseAdmin
    .from("timesheet_entries")
    .select("id, entry_date, hours")
    .eq("employee_id", session.userId)
    .eq("project_id", projectId)
    .gte("entry_date", `${monthPrefix}-01`)
    .lte("entry_date", `${monthPrefix}-31`);

  // Prefer the first day that actually has hours logged (matches v1's
  // intent), but never require it — falling back to any existing entry,
  // or creating a fresh 0-hour placeholder if the project has no rows yet
  // this month at all.
  const target =
    (entries ?? []).find((e) => Number(e.hours ?? 0) > 0) ?? (entries ?? [])[0];

  if (target) {
    const { error } = await supabaseAdmin
      .from("timesheet_entries")
      .update({ comment })
      .eq("id", target.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabaseAdmin.from("timesheet_entries").insert({
      employee_id: session.userId,
      entry_date: monthFirstDate,
      project_id: projectId,
      category: null,
      hours: 0,
      comment,
    });
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/timesheet");
  return { success: true };
}

/** Mirrors v1's /timesheet/delete_project_entries for the current user. */
export async function deleteOwnProjectEntriesAction(target: CellTarget) {
  const session = await requireSession();
  let q = supabaseAdmin
    .from("timesheet_entries")
    .delete()
    .eq("employee_id", session.userId);
  q = target.projectId ? q.eq("project_id", target.projectId) : q.eq("category", target.category as string);
  const { error } = await q;
  if (error) throw error;
  revalidatePath("/timesheet");
}
