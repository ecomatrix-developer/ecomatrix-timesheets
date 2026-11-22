// Seeds/updates src/lib/ai's knowledge base (ai_knowledge_chunks — see
// supabase_patch_6_ai_assistant.sql) with FAQ/feature/policy text for the
// admin chat assistant's search_knowledge_base tool. Idempotent: each
// topic is upserted by title (delete-then-insert), so re-running this
// after editing/adding an entry below is always safe — it never
// duplicates rows. Run with: npm run seed:ai-knowledge
//
// No dotenv dependency — parses .env.local directly so this never
// depends on whatever happens to be transitively installed.

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function embedTexts(texts) {
  const apiKey = env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set in .env.local.");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: "voyage-3", input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings request failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

// Add a new object here (or edit an existing one in place) any time a
// feature changes enough that the chatbot's answer would otherwise go
// stale, then rerun `npm run seed:ai-knowledge`.
const TOPICS = [
  {
    source: "faq",
    title: "How do I unlock/reopen someone's submitted timesheet?",
    content:
      "Go to the 'Reopen Timesheets' tab in the sidebar, pick the month the submission falls in, find the employee's row, and click Reopen. As of 2026-11-21 this is Super Admin only — a plain Admin no longer has this tab.",
  },
  {
    source: "feature-doc",
    title: "Reopening a submitted (locked) day",
    content:
      "Only a Super Admin can reopen a submitted day (moved off the Admin tier on 2026-11-21), from the 'Reopen Timesheets' tab in the sidebar. That page lists submitted days month-by-month (pick a month to see that month's submissions, to keep it fast) across ALL employees, with a Reopen button per row. Reopening deletes that day's lock (its submitted_days row), letting the employee edit it again. It does not delete the employee's logged hours, only the lock.",
  },
  {
    source: "feature-doc",
    title: "User types / roles available",
    content:
      "A user has two independent fields: access_level (super_admin, admin, or user) controlling what they can see/do in the app, and user_type (employee, intern, consultant, accountant, or marketing_bd) which only affects which projects they can select on the timesheet and how they're grouped/reported. A Super Admin assigns both from the 'Employees & Roles' page. Marketing & BD was added 2026-11-21.",
  },
  {
    source: "feature-doc",
    title: "Employees & Roles page",
    content:
      "Create Employee and Manage Roles were merged into one Super-Admin-only page, 'Employees & Roles', with a 'Create Employee' button in the top-right corner. From the same page a Super Admin can change any user's access level and user type, and use 'Reset Password' to generate and show a brand-new password for that user once. The app never stores or displays a user's actual current password — passwords are one-way hashed (bcrypt), so this issues a new password rather than revealing the old one.",
  },
  {
    source: "feature-doc",
    title: "Project visibility by user type",
    content:
      "A project can optionally be restricted to specific user types via 'Visible To' at creation/edit. If left unset (the default for every pre-existing project), Employees can always see it; Intern/Consultant/Accountant/Marketing & BD users only see a project once it's explicitly opened to their user type. This keeps the original ~198 legacy projects visible to Employees without requiring every one to be manually re-tagged. Admin and Super Admin always see every project regardless of this setting.",
  },
  {
    source: "feature-doc",
    title: "Multi-category project creation (Energy / BIM / Marketing & BD)",
    content:
      "When creating a project, the admin picks one or more categories: Energy, BIM, and/or Marketing & BD — a single project can be both Energy and BIM, for example. Picking only Marketing & BD switches the form to a simplified Marketing project (just a name, no client/ECO-number fields). Any other combination still produces one legacy project_type value, Energy Modelling or BIM and AutoCad (BIM wins if both are picked), which is what the Timesheet page's grouped project dropdown actually uses.",
  },
  {
    source: "feature-doc",
    title: "Contact Us inbox and notification bell",
    content:
      "Every Contact Us form submission (from Employee/Intern/Consultant/Marketing & BD) and every 'Forgot Password?' request is saved permanently in one table, never only emailed. Admin and Super Admin see a notification bell in the sidebar with a live unread count (contact submissions + pending leave requests), and can browse every submission, old or new, read or unread, on the Inbox page (/contact_submissions).",
  },
  {
    source: "feature-doc",
    title: "Weekly timesheet backup",
    content:
      "Every Monday, the app automatically emails a PDF timesheet backup for the prior week — one PDF per employee — to anup@ecomatrix.io and ervtool.ecomatrix@gmail.com. A Super Admin can also trigger the same backup manually from Database Stats ('Run Backup Now') at any time. There is no Google Drive upload step; it's email-only.",
  },
];

async function main() {
  const embeddings = await embedTexts(TOPICS.map((t) => t.content));

  for (let i = 0; i < TOPICS.length; i++) {
    const topic = TOPICS[i];
    const del = await supabase.from("ai_knowledge_chunks").delete().eq("title", topic.title);
    if (del.error) throw del.error;
    const ins = await supabase.from("ai_knowledge_chunks").insert({
      source: topic.source,
      title: topic.title,
      content: topic.content,
      embedding: embeddings[i],
    });
    if (ins.error) throw ins.error;
    console.log(`Seeded: [${topic.source}] ${topic.title}`);
  }

  const { count } = await supabase
    .from("ai_knowledge_chunks")
    .select("id", { count: "exact", head: true });
  console.log(`Done. ai_knowledge_chunks now has ${count} total rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
