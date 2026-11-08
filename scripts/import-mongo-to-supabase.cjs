const { randomUUID } = require("node:crypto");
const { loadEnvConfig } = require("@next/env");
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");
const { createClient } = require("@supabase/supabase-js");

loadEnvConfig(process.cwd());

const CATEGORIES = new Set([
  "Statutory holiday",
  "Vacation",
  "Sicktime",
  "Training / Research",
  "Overhead",
  "Overtime Logged",
  "PTO",
  "PTO BANKING",
  "Special Vacation",
  "Special Vacation Banking",
  "Research Initiatives",
  "Training",
  "empty_0",
]);

const PROJECT_STATUSES = new Set(["active", "completed", "re-work", "archived"]);
const USER_ROLES = new Set(["admin", "employee"]);
const TARGET_TABLES = [
  "users",
  "projects",
  "timesheet_entries",
  "submitted_days",
  "submitted_weeks",
];
const BATCH_SIZE = 500;

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is missing or is not text.`);
  }
  return value;
}

function dateOnly(value, label) {
  const date = requireText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return date;
}

function timestamp(value, label) {
  const source = requireText(value, label).trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(source);
  const normalized = hasTimezone
    ? source
    : `${source.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${label} is not a valid timestamp.`);
  }
  return parsed.toISOString();
}

function mongoId(document, label) {
  if (!document?._id) throw new Error(`${label} has no MongoDB _id.`);
  return document._id.toString();
}

function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function sourceJson(document, label) {
  return { ...document, _id: mongoId(document, label) };
}

function mergeComments(entries) {
  const comments = [...new Set(entries
    .map((entry) => entry.comment == null ? "" : String(entry.comment))
    .filter((comment) => comment.trim() !== ""))];
  if (comments.length === 0) return null;
  if (comments.length === 1) return comments[0];

  const parsed = comments.map((comment) => {
    try {
      const value = JSON.parse(comment);
      return Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  });
  if (parsed.every(Array.isArray)) return JSON.stringify(parsed.flat());
  return comments.join("\n\n");
}

async function countRows(supabase, table, column = "id") {
  const { count, error } = await supabase
    .from(table)
    .select(column, { count: "exact", head: true });
  if (error) throw new Error(`Could not count Supabase table ${table}: ${error.message}`);
  return count ?? 0;
}

async function existingStagedMongoIds(supabase, table) {
  const ids = new Set();
  let offset = 0;
  let count = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("raw")
      .range(offset, offset + BATCH_SIZE - 1);
    if (error) throw new Error(`Could not inspect staging table ${table}: ${error.message}`);
    for (const row of data ?? []) {
      count++;
      const rawId = row.raw?._id;
      if (typeof rawId === "string") ids.add(rawId);
      else if (typeof rawId?.$oid === "string") ids.add(rawId.$oid);
    }
    if (!data || data.length < BATCH_SIZE) break;
    offset += data.length;
  }
  return { ids, count };
}

async function insertRows(supabase, table, rows) {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
    console.log(`${table}: inserted ${Math.min(offset + batch.length, rows.length)} / ${rows.length}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.argv.includes("--dry-run")) {
    throw new Error("Choose either --dry-run or --apply, not both.");
  }

  const mongoUri = process.env.MONGODB_URI;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!mongoUri) throw new Error("Set MONGODB_URI in this PowerShell session first.");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local.");
  }

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  try {
    const database = mongo.db();
    if (database.databaseName !== "timesheetDB") {
      throw new Error(`Expected MongoDB database timesheetDB, got ${database.databaseName}.`);
    }

    const [sourceUsers, sourceProjects, sourceEntries, sourceDays, sourceWeeks] = await Promise.all([
      database.collection("users").find({}).toArray(),
      database.collection("projects").find({}).toArray(),
      database.collection("timesheet_entries").find({}).toArray(),
      database.collection("submitted_days").find({}).toArray(),
      database.collection("submitted_weeks").find({}).toArray(),
    ]);

    if (sourceWeeks.length > 0) {
      throw new Error("MongoDB has submitted_weeks rows; this importer currently expects that collection to be empty.");
    }

    const entryGroups = groupBy(
      sourceEntries,
      (entry) => JSON.stringify([entry.employee, entry.date, entry.project_id])
    );
    const duplicateEntryGroups = [...entryGroups.values()].filter((group) => group.length > 1);
    const duplicateEntryDocuments = duplicateEntryGroups.flat();
    const dayGroups = groupBy(sourceDays, (day) => JSON.stringify([day.employee, day.date]));
    const duplicateDayGroups = [...dayGroups.values()].filter((group) => group.length > 1);
    const duplicateDayDocuments = duplicateDayGroups.flat();
    const submittedDayKeys = new Set(dayGroups.keys());

    const importedAt = new Date().toISOString();
    const userIds = new Map();
    for (const user of sourceUsers) {
      const username = requireText(user.username, "MongoDB user username");
      const role = requireText(user.role, `MongoDB user ${username} role`).toLowerCase().trim();
      if (!USER_ROLES.has(role)) throw new Error(`MongoDB user ${username} has an unsupported role.`);
      userIds.set(username, randomUUID());
    }
    if (userIds.size !== sourceUsers.length) {
      throw new Error("MongoDB contains duplicate usernames.");
    }

    const projectIds = new Map();
    for (const project of sourceProjects) {
      projectIds.set(mongoId(project, "MongoDB project"), randomUUID());
    }

    const userRows = await Promise.all(sourceUsers.map(async (user) => {
      const username = requireText(user.username, "MongoDB user username");
      const password = requireText(user.password, `MongoDB user ${username} password`);
      return {
        id: userIds.get(username),
        mongo_id: mongoId(user, "MongoDB user"),
        username,
        name: requireText(user.name, `MongoDB user ${username} name`),
        password_hash: await bcrypt.hash(password, 10),
        role: String(user.role).toLowerCase().trim(),
        auth_user_id: null,
        created_at: importedAt,
        updated_at: importedAt,
      };
    }));

    const projectRows = sourceProjects.map((project) => {
      const status = requireText(project.status, "MongoDB project status").toLowerCase().trim();
      if (!PROJECT_STATUSES.has(status)) throw new Error("MongoDB contains an unsupported project status.");
      return {
        id: projectIds.get(mongoId(project, "MongoDB project")),
        mongo_id: mongoId(project, "MongoDB project"),
        project_number: project.project_number || null,
        client_name: requireText(project.client_name, "MongoDB project client_name"),
        name: requireText(project.name, "MongoDB project name"),
        description: project.description || null,
        status,
        project_type: "Energy Modelling",
        created_at: importedAt,
        updated_at: importedAt,
      };
    });

    const entryRows = [...entryGroups.values()].map((group) => {
      const entries = [...group].sort((left, right) =>
        mongoId(left, "MongoDB timesheet entry").localeCompare(mongoId(right, "MongoDB timesheet entry"))
      );
      const entry = entries[0];
      const employee = requireText(entry.employee, "MongoDB timesheet employee");
      const projectRef = requireText(entry.project_id, "MongoDB timesheet project_id");
      const employeeId = userIds.get(employee);
      if (!employeeId) throw new Error("A timesheet entry references an unknown employee username.");
      const projectId = projectIds.get(projectRef);
      const category = projectId ? null : projectRef;
      if (!projectId && !CATEGORIES.has(category)) {
        throw new Error("A timesheet entry references neither a MongoDB project nor a recognized category.");
      }
      const sourceHours = entries.map((item) => Number(item.hours));
      if (sourceHours.some((hours) => !Number.isFinite(hours))) {
        throw new Error("A timesheet entry has invalid hours.");
      }
      const hasSubmittedDay = submittedDayKeys.has(JSON.stringify([employee, entry.date]));
      const sameHours = sourceHours.every((hours) => hours === sourceHours[0]);
      if (hasSubmittedDay && !sameHours) {
        throw new Error("A duplicate submitted-day cell has conflicting hours; review its staged source before importing.");
      }
      const exactDuplicate = entries.every((item) =>
        Number(item.hours) === sourceHours[0] && (item.comment ?? null) === (entry.comment ?? null)
      );
      const hours = entries.length === 1 || hasSubmittedDay || exactDuplicate
        ? sourceHours[0]
        : sourceHours.reduce((sum, value) => sum + value, 0);
      const comment = entries.length === 1 || hasSubmittedDay
        ? (entry.comment == null ? null : String(entry.comment))
        : mergeComments(entries);

      return {
        id: randomUUID(),
        mongo_id: mongoId(entry, "MongoDB timesheet entry"),
        employee_id: employeeId,
        project_id: projectId,
        category,
        entry_date: dateOnly(entry.date, "MongoDB timesheet date"),
        hours,
        comment,
        created_at: importedAt,
        updated_at: importedAt,
      };
    });

    const canonicalDays = [...dayGroups.values()].map((group) => [...group].sort((left, right) =>
      timestamp(right.submitted_at, "MongoDB submitted_at").localeCompare(
        timestamp(left.submitted_at, "MongoDB submitted_at")
      ) || mongoId(right, "MongoDB submitted day").localeCompare(mongoId(left, "MongoDB submitted day"))
    )[0]);
    const dayRows = canonicalDays.map((day) => {
      const employee = requireText(day.employee, "MongoDB submitted-day employee");
      const employeeId = userIds.get(employee);
      if (!employeeId) throw new Error("A submitted day references an unknown employee username.");
      let entriesData = null;
      if (day.entries_data != null) {
        try {
          entriesData = typeof day.entries_data === "string"
            ? JSON.parse(day.entries_data)
            : day.entries_data;
        } catch {
          throw new Error("A submitted-day entries_data value is not valid JSON.");
        }
      }
      const submittedAt = timestamp(day.submitted_at, "MongoDB submitted_at");
      const totalHours = Number(day.total_hours);
      if (!Number.isFinite(totalHours)) throw new Error("A submitted day has invalid total_hours.");

      return {
        id: randomUUID(),
        mongo_id: mongoId(day, "MongoDB submitted day"),
        employee_id: employeeId,
        entry_date: dateOnly(day.date, "MongoDB submitted-day date"),
        total_hours: totalHours,
        submitted_at: submittedAt,
        entries_data: entriesData,
        created_at: submittedAt,
      };
    });

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const targetCounts = {};
    for (const table of TARGET_TABLES) targetCounts[table] = await countRows(supabase, table);
    const [stagedEntries, stagedDays] = await Promise.all([
      existingStagedMongoIds(supabase, "staging_mongo_timesheet_entries"),
      existingStagedMongoIds(supabase, "staging_mongo_submitted_days"),
    ]);
    const stagingEntryRows = duplicateEntryDocuments
      .map((entry) => ({ raw: sourceJson(entry, "MongoDB timesheet entry"), imported_at: importedAt }))
      .filter((row) => !stagedEntries.ids.has(row.raw._id));
    const stagingDayRows = duplicateDayDocuments
      .map((day) => ({ raw: sourceJson(day, "MongoDB submitted day"), imported_at: importedAt }))
      .filter((row) => !stagedDays.ids.has(row.raw._id));

    console.log(JSON.stringify({
      mode: apply ? "APPLY" : "DRY RUN",
      mongoDatabase: database.databaseName,
      sourceCounts: {
        users: sourceUsers.length,
        projects: sourceProjects.length,
        timesheet_entries: sourceEntries.length,
        submitted_days: sourceDays.length,
        submitted_weeks: sourceWeeks.length,
      },
      mappedCounts: {
        users: userRows.length,
        projects: projectRows.length,
        timesheet_entries: entryRows.length,
        submitted_days: dayRows.length,
        submitted_weeks: 0,
      },
      duplicateTimesheetCells: {
        cells: duplicateEntryGroups.length,
        rowsBeyondFirst: duplicateEntryGroups.reduce((sum, group) => sum + group.length - 1, 0),
      },
      duplicateSubmittedDays: {
        employeeDateKeys: duplicateDayGroups.length,
        rowsBeyondFirst: duplicateDayGroups.reduce((sum, group) => sum + group.length - 1, 0),
      },
      stagedOriginals: {
        timesheetEntriesToAdd: stagingEntryRows.length,
        submittedDaysToAdd: stagingDayRows.length,
        existingTimesheetEntryRawRows: stagedEntries.count,
        existingSubmittedDayRawRows: stagedDays.count,
      },
      currentSupabaseCounts: targetCounts,
      notes: [
        "MongoDB passwords are bcrypt-hashed for the Next.js app.",
        "MongoDB projects have no project_type, so imported projects default to Energy Modelling.",
        "Missing MongoDB created_at/updated_at values are set to the import time.",
        "Timezone-free submitted_at values are interpreted as UTC.",
        "Operational tables contain one row per employee/date/project or category, as required by Supabase unique indexes.",
        "All raw documents in duplicate timesheet cells and duplicate submitted-day groups are preserved in staging_mongo_timesheet_entries and staging_mongo_submitted_days.",
        "Submitted duplicate cells keep one row's hours; unsubmitted non-identical duplicates sum hours. Exact duplicate rows count once in operational data.",
        "Duplicate submitted days keep the latest submitted_at record in the operational table; all originals are staged.",
      ],
    }, null, 2));

    if (!apply) {
      console.log("No rows were written. Review this report, then run with --apply only after backing up and emptying the target tables.");
      return;
    }

    const nonEmptyTables = Object.entries(targetCounts).filter(([, count]) => count > 0);
    if (nonEmptyTables.length > 0) {
      throw new Error(`Refusing to import because these target tables are not empty: ${nonEmptyTables.map(([table]) => table).join(", ")}.`);
    }

    await insertRows(supabase, "staging_mongo_timesheet_entries", stagingEntryRows);
    await insertRows(supabase, "staging_mongo_submitted_days", stagingDayRows);
    await insertRows(supabase, "users", userRows);
    await insertRows(supabase, "projects", projectRows);
    await insertRows(supabase, "timesheet_entries", entryRows);
    await insertRows(supabase, "submitted_days", dayRows);
    await insertRows(supabase, "submitted_weeks", []);

    const finalCounts = {};
    for (const table of TARGET_TABLES) finalCounts[table] = await countRows(supabase, table);
    finalCounts.staging_mongo_timesheet_entries = await countRows(supabase, "staging_mongo_timesheet_entries", "raw");
    finalCounts.staging_mongo_submitted_days = await countRows(supabase, "staging_mongo_submitted_days", "raw");
    console.log("Final Supabase counts:");
    console.log(JSON.stringify(finalCounts, null, 2));
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});