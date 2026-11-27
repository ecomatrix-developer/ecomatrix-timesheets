-- Abeer, 2026-11-27: "delete the test accounts as well give em query for
-- that." This is NOT a schema patch (nothing here changes a table), just
-- a one-off cleanup script — run the two steps separately, in order.
--
-- IMPORTANT: run_ONE_first. Step 1 only reads data — review its results
-- and edit the username list in Step 2 to match EXACTLY the accounts you
-- actually want gone before running anything that deletes.

-- ============================================================
-- STEP 1 — find candidates. Broad net on common test-account naming;
-- edit/extend the patterns below if your test accounts don't match.
-- ============================================================
select id, username, name, email, role, access_level, user_type, created_at
from users
where username ilike '%test%'
   or name ilike '%test%'
   or email ilike '%test%'
   or username ilike '%demo%'
order by created_at;

-- ============================================================
-- STEP 2 — delete. Fill in the exact usernames from Step 1's results
-- (never run this against real employee accounts).
--
-- Most of a user's OWN data cascades automatically when the row is
-- deleted (leave_requests, leave_balances, employee_documents,
-- document_folders, ai_chat_messages all have ON DELETE CASCADE on
-- employee_id). What does NOT cascade — because these columns record who
-- performed an action on someone ELSE's record, not ownership — is
-- cleaned up first below, scoped to only the target accounts' OWN rows,
-- so nothing belonging to a real employee is touched:
--   - leave_requests.decided_by / leave_request_messages.sender_id /
--     contact_submissions.read_by / contact_submission_messages.sender_id
--     (nullable — set to NULL rather than deleting someone else's
--     leave/contact record)
--   - employee_documents.uploaded_by / employee_document_downloads.
--     downloaded_by / document_folders.created_by / leave_balances.
--     created_by / updated_by / project_status_audit.changed_by
--     (also set to NULL where nullable)
--
-- If this still fails with a foreign-key violation, the error names the
-- exact table/column still pointing at one of these accounts — tell me
-- that error and I'll add the right line here rather than guessing.
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
update leave_requests set decided_by = null where decided_by in (select id from target_users);
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
update leave_request_messages set sender_id = null where sender_id in (select id from target_users);
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
update contact_submissions set read_by = null where read_by in (select id from target_users);
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
update contact_submission_messages set sender_id = null where sender_id in (select id from target_users);
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
update employee_documents set uploaded_by = null where uploaded_by in (select id from target_users);
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
delete from employee_document_downloads where downloaded_by in (select id from target_users);
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
update leave_balances set created_by = null, updated_by = null where created_by in (select id from target_users) or updated_by in (select id from target_users);
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
update project_status_audit set changed_by = null where changed_by in (select id from target_users);

-- document_folders.created_by is NOT NULL — a test account that created a
-- folder can't just have this nulled out, so those folders (and whatever
-- is in them) are deleted outright. Only ever matters if a test account
-- was actually used to create folders under /manage_documents.
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
delete from employee_documents where folder_id in (
  select id from document_folders where created_by in (select id from target_users)
);
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
delete from document_folders where created_by in (select id from target_users);

-- This repo has no tracked schema file for timesheet_entries/
-- submitted_days (pre-dates the supabase_patch_*.sql series), so their
-- exact FK behavior on users(id) isn't something I can confirm from code
-- — deleting those rows explicitly first is the safe assumption either
-- way (cascade or not, this leaves nothing to conflict with).
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
delete from timesheet_entries where employee_id in (select id from target_users);
with target_users as (
  select id from users where username in (
    'REPLACE_WITH_EXACT_USERNAME_1',
    'REPLACE_WITH_EXACT_USERNAME_2'
  )
)
delete from submitted_days where employee_id in (select id from target_users);

-- Finally, the accounts themselves.
delete from users where username in (
  'REPLACE_WITH_EXACT_USERNAME_1',
  'REPLACE_WITH_EXACT_USERNAME_2'
);

-- Verify afterward:
-- select id, username from users where username in ('REPLACE_WITH_EXACT_USERNAME_1', 'REPLACE_WITH_EXACT_USERNAME_2');
-- (should return zero rows)
