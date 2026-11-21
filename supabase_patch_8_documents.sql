-- Employee document portal (pulled forward from the brief's Phase 2 —
-- Abeer wants this now). Super Admin uploads a document for one specific
-- employee (salary slip, letter, personal document, etc.); only that
-- employee (and Super Admin) can ever see or download it. Nobody else —
-- not even a plain Admin — gets any access, matching the brief's "No
-- access to other people's personal documents" rule for Admin.
--
-- Purely additive: two new tables, one new private storage bucket.
-- Nothing here touches users/projects/timesheet_entries. Safe to run in
-- one go.

-- 1. Private storage bucket. `public: false` means files are never
--    reachable by a bare URL — every read goes through a signed URL this
--    app generates server-side with the service-role key after checking
--    the requester is either the document's owner or a Super Admin.
--    There are deliberately no storage RLS policies: all access is
--    mediated by server actions using the service-role key (which
--    bypasses RLS), never direct client access to the bucket.
insert into storage.buckets (id, name, public, file_size_limit)
values ('employee-documents', 'employee-documents', false, 15728640) -- 15MB
on conflict (id) do nothing;

-- 2. The documents themselves.
CREATE TABLE IF NOT EXISTS employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN (
    'salary_slip', 'offer_letter', 'appointment_letter', 'confirmation_letter',
    'increment_letter', 'nda', 'id_proof', 'address_proof', 'bank_document', 'other'
  )),
  title text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee
  ON employee_documents (employee_id, created_at DESC);

-- 3. Download audit log, per the brief's own privacy rule ("log who
--    downloads a document") — cheap to add now while building this.
CREATE TABLE IF NOT EXISTS employee_document_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES employee_documents(id) ON DELETE CASCADE,
  downloaded_by uuid NOT NULL REFERENCES users(id),
  downloaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_document_downloads_document
  ON employee_document_downloads (document_id);

-- Verify afterward:
-- select id, public from storage.buckets where id = 'employee-documents';
-- select table_name from information_schema.tables
--   where table_name in ('employee_documents', 'employee_document_downloads');
