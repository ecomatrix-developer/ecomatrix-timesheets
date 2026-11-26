-- Document folders (Abeer, 2026-11-27): "instead of form and upload make
-- it like we do create a folder and name that folder and we can go inside
-- that folder and upload the document and the name of file will be shown
-- there" — replaces the fixed category dropdown with real, user-named
-- folders, one per employee's document space. Also what lets an
-- Accountant get the same document access as Super Admin (supabase_patch_8
-- originally restricted employee_documents to the employee + Super Admin
-- only; Abeer, 2026-11-27: "all users doc view o that accountant can check
-- the docs of the users and also upload them").
--
-- Purely additive + one relaxed constraint. Safe to run any time after
-- supabase_patch_8_documents.sql.

-- 1. Folders: scoped to one employee's document space, named by whoever
--    created them (Super Admin or Accountant). A folder can't be deleted
--    while it still has documents in it (ON DELETE RESTRICT, the default)
--    — deleteDocumentFolderAction surfaces that as a friendly "empty it
--    first" message rather than silently cascading away someone's files.
CREATE TABLE IF NOT EXISTS document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_folders_employee_name_unique UNIQUE (employee_id, name)
);

CREATE INDEX IF NOT EXISTS idx_document_folders_employee
  ON document_folders (employee_id, name);

-- 2. Every document now lives in a folder going forward. folder_id is
--    nullable so documents uploaded before this patch (which only ever
--    had a category, no folder) keep working — the app shows those under
--    an "Uncategorized" pseudo-folder instead of hiding them.
ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES document_folders(id);

-- category was NOT NULL under the old fixed-dropdown model; the
-- folder-based upload form no longer collects one, so new rows insert it
-- as NULL (a NULL always satisfies the existing CHECK(category IN (...))
-- constraint — Postgres only fails CHECK on an explicit false, never on
-- NULL — so nothing else needs to change).
ALTER TABLE employee_documents
  ALTER COLUMN category DROP NOT NULL;

-- Verify afterward:
-- select table_name from information_schema.tables where table_name = 'document_folders';
-- select column_name, is_nullable from information_schema.columns where table_name = 'employee_documents' and column_name in ('folder_id','category');
