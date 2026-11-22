"use client";

import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { PublicUser, EmployeeDocument } from "@/lib/types";
import {
  uploadDocumentAction,
  deleteDocumentAction,
  getDocumentDownloadUrlAction,
  type UploadDocumentState,
} from "@/app/(actions)/documentActions";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/constants";
import Select from "@/components/Select";
import Modal from "@/components/Modal";
import { toast } from "@/lib/toast";
import { FaUserCircle, FaFileAlt, FaUpload, FaDownload, FaTrash, FaLock } from "react-icons/fa";

const CATEGORY_OPTIONS = Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// Fixed "en-US" locale, not the runtime's default — avoids a hydration
// mismatch between the server's and browser's default locale.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary inline-flex items-center justify-center gap-2 py-2.5"
    >
      <FaUpload className="h-3.5 w-3.5" /> {pending ? "Uploading…" : "Upload Document"}
    </button>
  );
}

export default function ManageDocumentsClient({
  employee,
  documents,
}: {
  employee: PublicUser;
  documents: EmployeeDocument[];
}) {
  const router = useRouter();
  const boundUpload = uploadDocumentAction.bind(null, employee.id);
  const initialState: UploadDocumentState = {};
  const [state, formAction] = useActionState(boundUpload, initialState);
  const [category, setCategory] = useState("other");
  const formRef = useRef<HTMLFormElement>(null);
  const lastState = useRef<UploadDocumentState>(initialState);

  const [toDelete, setToDelete] = useState<EmployeeDocument | null>(null);
  const [pending, startTransition] = useTransition();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.success) {
      toast.success("Document uploaded.");
      formRef.current?.reset();
      setCategory("other");
      router.refresh();
    }
  }, [state, router]);

  async function handleDownload(doc: EmployeeDocument) {
    setDownloadingId(doc.id);
    const result = await getDocumentDownloadUrlAction(doc.id);
    setDownloadingId(null);
    if (result.error || !result.url) {
      toast.error(result.error ?? "Could not get download link.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  function confirmDelete() {
    if (!toDelete) return;
    startTransition(async () => {
      const result = await deleteDocumentAction(toDelete.id);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      setToDelete(null);
      router.refresh();
    });
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <FaUserCircle className="text-accent" /> Employee Details
      </h1>

      <div className="glass p-6 mb-6">
        <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-muted">Name</p>
            <p className="font-medium">{employee.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Username</p>
            <p className="font-medium">{employee.username}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Email</p>
            <p className="font-medium">{employee.email || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Access level</p>
            <p className="font-medium capitalize">
              {(employee.access_level ?? (employee.role === "admin" ? "admin" : "user")).replace(
                "_",
                " "
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">User type</p>
            <p className="font-medium capitalize">{employee.user_type ?? "employee"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Job title</p>
            <p className="font-medium">{employee.job_title || "—"}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6 items-start">
        <form
          ref={formRef}
          action={formAction}
          className="glass-strong p-6 flex flex-col gap-4"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FaUpload className="text-accent h-4 w-4" /> Upload Document
          </h2>
          <div>
            <label className="text-sm text-muted mb-1 block">Category</label>
            <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
            <input type="hidden" name="category" value={category} />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Title</label>
            <input
              name="title"
              required
              placeholder="e.g. Salary slip — March 2027"
              className="glass-input w-full px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">File</label>
            <input
              name="file"
              type="file"
              required
              className="glass-input w-full px-3 py-2.5 text-sm"
            />
            <p className="text-xs text-muted mt-1">Up to 15MB.</p>
          </div>
          <UploadButton />
        </form>

        <div className="glass !p-0 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <FaFileAlt className="text-accent h-4 w-4" /> Documents
            </h2>
            <span className="text-xs text-muted flex items-center gap-1.5">
              <FaLock className="h-3 w-3 shrink-0" /> Only {employee.name} and Super Admin can see these
            </span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[32rem] overflow-y-auto scrollbar-thin">
            {documents.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">No documents uploaded yet.</p>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="h-9 w-9 shrink-0 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                    <FaFileAlt className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{doc.title}</p>
                    <p className="text-xs text-muted truncate">
                      {DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category} ·{" "}
                      {formatDate(doc.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    title="Download"
                    className="shrink-0 p-2 rounded-lg text-accent hover:bg-accent/10 transition-colors"
                  >
                    <FaDownload className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setToDelete(doc)}
                    title="Delete"
                    className="shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <FaTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete document?">
        <p className="text-sm text-muted mb-4">
          This permanently deletes <strong>{toDelete?.title}</strong>. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setToDelete(null)}>
            Cancel
          </button>
          <button className="btn-danger px-4 py-2 text-sm" disabled={pending} onClick={confirmDelete}>
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
