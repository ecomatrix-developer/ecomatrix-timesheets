import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import {
  listEmployees,
  listProjects,
  getEmployeeHoursSummary,
  getProjectSummary,
  getLeaveSummary,
  getSubmissionStatus,
  getOrgOverview,
} from "./dataTools";
import { searchKnowledgeBase } from "./knowledgeSearch";

// The curated set of safe, parameterized queries Claude can call — never
// arbitrary SQL. Each one maps to a specific, bounded Supabase read.
export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_employees",
    description:
      "List all employees (name, username, id). Use this to see who exists or to resolve an ambiguous employee reference before trying another tool.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_projects",
    description:
      "Search/list projects by free-text name/number/client match, status, client, or project type. Use this before get_project_summary if you don't know the exact project name.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Free-text match against project name, number, or client." },
        status: { type: "string", enum: ["active", "completed", "re-work", "archived"] },
        client_name: { type: "string" },
        project_type: { type: "string", enum: ["Energy Modelling", "BIM and AutoCad"] },
      },
    },
  },
  {
    name: "get_employee_hours_summary",
    description:
      "Total hours logged by one employee over a date range, split by project and by leave category (PTO, Vacation, Sicktime, etc). Dates default to all-time if omitted.",
    input_schema: {
      type: "object",
      properties: {
        employee: { type: "string", description: "Employee name or username (fuzzy match)." },
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["employee"],
    },
  },
  {
    name: "get_project_summary",
    description:
      "Project metadata (client, status, type) plus total hours logged and the per-employee breakdown, over an optional date range.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name, number, or close match." },
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["project"],
    },
  },
  {
    name: "get_leave_summary",
    description:
      "Leave/category hours (Statutory holiday, Vacation, Special Vacation, Sicktime, Training / Research, Overhead, PTO, PTO BANKING, Special Vacation Banking) for one employee, or org-wide if employee is omitted.",
    input_schema: {
      type: "object",
      properties: {
        employee: { type: "string" },
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "get_submission_status",
    description:
      "For one employee and date range, which weekdays have a submitted (locked) timesheet and which weekdays are still missing one. Weekends are never required.",
    input_schema: {
      type: "object",
      properties: {
        employee: { type: "string" },
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["employee", "date_from", "date_to"],
    },
  },
  {
    name: "get_org_overview",
    description:
      "Company-wide snapshot: total hours logged, employee/project counts, projects by status, and the top 5 projects/employees by hours over a date range (defaults to all-time).",
    input_schema: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "search_knowledge_base",
    description:
      "Semantic search over the app's FAQ/feature/policy knowledge base — use this for 'how does X work' or policy questions, not for live data lookups.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

export async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "list_employees":
      return listEmployees();
    case "list_projects":
      return listProjects(input);
    case "get_employee_hours_summary":
      return getEmployeeHoursSummary(input as unknown as Parameters<typeof getEmployeeHoursSummary>[0]);
    case "get_project_summary":
      return getProjectSummary(input as unknown as Parameters<typeof getProjectSummary>[0]);
    case "get_leave_summary":
      return getLeaveSummary(input);
    case "get_submission_status":
      return getSubmissionStatus(input as unknown as Parameters<typeof getSubmissionStatus>[0]);
    case "get_org_overview":
      return getOrgOverview(input);
    case "search_knowledge_base":
      return searchKnowledgeBase(String(input.query ?? ""));
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
