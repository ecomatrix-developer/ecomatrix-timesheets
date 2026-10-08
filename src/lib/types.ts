export type Role = "admin" | "employee";

export interface User {
  id: string;
  mongo_id: string | null;
  username: string;
  name: string;
  password_hash: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export type PublicUser = Omit<User, "password_hash">;

export type ProjectType = "Energy Modelling" | "BIM and AutoCad";

export interface Project {
  id: string;
  mongo_id: string | null;
  project_number: string | null;
  client_name: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "re-work" | "archived";
  // Splits projects into the two grouped dropdowns on the Timesheet page's
  // "Project Selection" card, and the type filter/column on Projects.
  // Matches v1 exactly: untyped legacy projects count as "Energy Modelling"
  // (enforced by the DB column's default, so this is never actually null).
  project_type: ProjectType;
  created_at: string;
  updated_at: string;
}

export interface TimesheetEntry {
  id: string;
  mongo_id: string | null;
  employee_id: string;
  project_id: string | null;
  category: string | null;
  entry_date: string; // YYYY-MM-DD
  hours: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmittedDay {
  id: string;
  mongo_id: string | null;
  employee_id: string;
  entry_date: string;
  total_hours: number;
  submitted_at: string;
  entries_data: unknown;
  created_at: string;
}

export interface SubmittedWeek {
  id: string;
  mongo_id: string | null;
  employee_id: string;
  week_key: string;
  week_start: string;
  week_end: string;
  total_hours: number;
  submitted_at: string;
  entries_data: unknown;
  created_at: string;
}

export interface SessionPayload {
  userId: string;
  username: string;
  name: string;
  role: Role;
}

// A single grid "row target" is either a project or a special category —
// exactly one of the two, matching the DB's CHECK constraint.
export type RowTarget =
  | { kind: "project"; projectId: string }
  | { kind: "category"; category: string };

export function rowTargetKey(t: RowTarget): string {
  return t.kind === "project" ? `p:${t.projectId}` : `c:${t.category}`;
}
