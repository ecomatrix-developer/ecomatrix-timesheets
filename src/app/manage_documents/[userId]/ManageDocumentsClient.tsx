"use client";

import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PublicUser, EmployeeDocument, DocumentFolder } from "@/lib/types";
import {
  uploadDocumentAction,
  deleteDocumentAction,
  createDocumentFolderAction,
  deleteDocumentFolderAction,
  getDocumentDownloadUrlAction,
  type UploadDocumentState,
} from "@/app/(actions)/documentActions";
import Modal from "@/components/Modal";
import { triggerFileDownload } from "@/lib/downloadFile";
import { toast } from "@/lib/toast";
import {
  FaUserCircle,
  FaFileAlt,
  FaUpload,
  FaDownload,
  FaTrash,
  FaLock,
  FaFolder,
  FaFolderPlus,
  FaChevronRight,
  FaArrowLeft,
} from "react-icons/fa";

// Fixed "en-US" locale, not the runtime's default — avoids a hydration
// mismatch between the server's and browser's default locale.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary inline-flex items-center justify-center gap-2 py-2 px-4 text-sm shrink-0"
    >
      <FaUpload className="h-3.5 w-3.5" /> {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

// Abeer, 2026-11-27: "instead of form and upload make it like we do create
// a folder and name that folder and we can go inside that folder and
// upload the document and the name of file will be shown there" — the
// document-category dropdown is gone; this is a small two-level file
// browser instead (folder list -> inside one folder).
type FolderView = { kind: "root" } | { kind: "folder"; folder: DocumentFolder } | { kind: "uncategorized" };

function UploadForm({ employeeId, folderId }: { employeeId: string; folderId: string }) {
  const router = useRouter();
  const boundUpload = uploadDocumentAction.bind(null, employeeId, folderId);
  const initialState: UploadDocumentState = {};
  const [state, formAction] = useActionState(boundUpload, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const lastState = useRef<UploadDocumentState>(initialState);

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.success) {
      toast.success("Document uploaded.");
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-100 bg-gray-50/60">
      <input name="file" type="file" required className="glass-input min-w-0 flex-1 px-3 py-2 text-sm" />
      <UploadButton />
      <p className="w-full text-xs text-muted">Up to 15MB — the file&apos;s own name is shown as its title.</p>
    </form>
  );
}

export default function ManageDocumentsClient({
  employee,
  documents,
  folders,
}: {
  employee: PublicUser;
  documents: EmployeeDocument[];
  folders: DocumentFolder[];
}) {
  const router = useRouter();
  const [view, setView] = useState<FolderView>({ kind: "root" });
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [toDelete, setToDelete] = useState<EmployeeDocument | null>(null);
  const [toDeleteFolder, setToDeleteFolder] = useState<DocumentFolder | null>(null);
  const [pending, startTransition] = useTransition();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const docsByFolder = useMemo(() => {
    const map = new Map<string, EmployeeDocument[]>();
    const uncategorized: EmployeeDocument[] = [];
    for (const d of documents) {
      if (!d.folder_id) {
        uncategorized.push(d);
        continue;
      }
      const list = map.get(d.folder_id) ?? [];
      list.push(d);
      map.set(d.folder_id, list);
    }
    return { map, uncategorized };
  }, [documents]);

  // The folder currently open might have just been deleted elsewhere (or
  // its id is stale after a refresh) — fall back to root rather than
  // rendering a view for a folder that no longer exists.
  const activeFolder =
    view.kind === "folder" ? folders.find((f) => f.id === view.folder.id) ?? null : null;
  useEffect(() => {
    if (view.kind === "folder" && !activeFolder) setView({ kind: "root" });
  }, [view, activeFolder]);

  function createFolder() {
    const name = newFolderName.trim();
    if (!name) {
      toast.error("Folder name is required.");
      return;
    }
    setCreatingFolder(true);
    startTransition(async () => {
      const result = await createDocumentFolderAction(employee.id, name);
      setCreatingFolder(false);
      if (result.success) {
        toast.success(result.message);
        setNewFolderOpen(false);
        setNewFolderName("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function confirmDeleteFolder() {
    if (!toDeleteFolder) return;
    startTransition(async () => {
      const result = await deleteDocumentFolderAction(toDeleteFolder.id);
      if (result.success) {
        toast.success(result.message);
        setView({ kind: "root" });
      } else {
        toast.error(result.message);
      }
      setToDeleteFolder(null);
      router.refresh();
    });
  }

  async function handleDownload(doc: EmployeeDocument) {
    setDownloadingId(doc.id);
    const result = await getDocumentDownloadUrlAction(doc.id);
    setDownloadingId(null);
    if (result.error || !result.url) {
      toast.error(result.error ?? "Could not get download link.");
      return;
    }
    triggerFileDownload(result.url, doc.file_name);
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

  function renderDocRow(doc: EmployeeDocument) {
    return (
      <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <div className="h-9 w-9 shrink-0 rounded-full bg-accent/10 text-accent flex items-center justify-center">
          <FaFileAlt className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{doc.file_name}</p>
          <p className="text-xs text-muted truncate">
            {formatDate(doc.created_at)}
            {doc.file_size ? ` · ${formatSize(doc.file_size)}` : ""}
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
    );
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

      <div className="glass !p-0 overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm min-w-0">
              {view.kind === "root" ? (
                <h2 className="font-semibold flex items-center gap-2">
                  <FaFileAlt className="text-accent h-4 w-4" /> Documents
                </h2>
              ) : (
                <>
                  <button
                    onClick={() => setView({ kind: "root" })}
                    className="shrink-0 p-1.5 rounded-lg text-muted hover:bg-gray-100 transition-colors"
                    title="Back to folders"
                  >
                    <FaArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-muted shrink-0">Documents</span>
                  <FaChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                  <span className="font-semibold truncate">
                    {view.kind === "uncategorized" ? "Uncategorized" : view.folder.name}
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {view.kind === "root" && (
                <button
                  onClick={() => setNewFolderOpen(true)}
                  className="btn-primary inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                >
                  <FaFolderPlus className="h-3.5 w-3.5" /> New Folder
                </button>
              )}
              {view.kind === "folder" && (
                <button
                  onClick={() => setToDeleteFolder(view.folder)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <FaTrash className="h-3 w-3" /> Delete Folder
                </button>
              )}
            </div>
          </div>
          {/* Abeer, 2026-11-27: "full accountant view must be responsive
              across all screens" — this note used to share a row with the
              buttons above and could overflow a phone-width screen; it's
              its own full-width line now, always. */}
          <p className="text-xs text-muted flex items-center gap-1.5 mt-2">
            <FaLock className="h-3 w-3 shrink-0" /> Only {employee.name}, Super Admin &amp; Accountant can see these
          </p>
        </div>

        {view.kind === "root" && (
          <div className="p-4">
            {folders.length === 0 && docsByFolder.uncategorized.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">
                No folders yet — create one above, then open it to upload files.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setView({ kind: "folder", folder: f })}
                    className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 hover:border-accent/30 transition-colors text-center"
                  >
                    <FaFolder className="h-8 w-8 text-accent" />
                    <span className="text-sm font-medium truncate w-full">{f.name}</span>
                    <span className="text-xs text-muted">
                      {(docsByFolder.map.get(f.id) ?? []).length} file
                      {(docsByFolder.map.get(f.id) ?? []).length === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
                {docsByFolder.uncategorized.length > 0 && (
                  <button
                    onClick={() => setView({ kind: "uncategorized" })}
                    className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 hover:bg-gray-100 transition-colors text-center"
                  >
                    <FaFolder className="h-8 w-8 text-gray-400" />
                    <span className="text-sm font-medium truncate w-full text-muted">Uncategorized</span>
                    <span className="text-xs text-muted">
                      {docsByFolder.uncategorized.length} file{docsByFolder.uncategorized.length === 1 ? "" : "s"}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {view.kind === "folder" && activeFolder && (
          <>
            <UploadForm employeeId={employee.id} folderId={activeFolder.id} />
            <div className="divide-y divide-gray-100 max-h-[28rem] overflow-y-auto scrollbar-thin">
              {(docsByFolder.map.get(activeFolder.id) ?? []).length === 0 ? (
                <p className="text-sm text-muted text-center py-10">This folder is empty — upload a file above.</p>
              ) : (
                (docsByFolder.map.get(activeFolder.id) ?? []).map(renderDocRow)
              )}
            </div>
          </>
        )}

        {view.kind === "uncategorized" && (
          <>
            <p className="text-xs text-muted px-5 py-3 border-b border-gray-100 bg-gray-50/60">
              Uploaded before folders existed. To move one into a folder, upload it again inside that
              folder, then delete the old copy here.
            </p>
            <div className="divide-y divide-gray-100 max-h-[28rem] overflow-y-auto scrollbar-thin">
              {docsByFolder.uncategorized.map(renderDocRow)}
            </div>
          </>
        )}
      </div>

      <Modal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title="New folder">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-muted mb-1 block">Folder name</label>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFolder()}
              placeholder="e.g. Payslips 2026"
              autoFocus
              className="glass-input w-full px-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary px-4 py-2 text-sm" disabled={creatingFolder} onClick={createFolder}>
              {creatingFolder ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!toDeleteFolder} onClose={() => setToDeleteFolder(null)} title="Delete folder?">
        <p className="text-sm text-muted mb-4">
          This permanently deletes the folder <strong>{toDeleteFolder?.name}</strong>. It must be empty
          first — delete any files inside it before this will succeed.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setToDeleteFolder(null)}>
            Cancel
          </button>
          <button className="btn-danger px-4 py-2 text-sm" disabled={pending} onClick={confirmDeleteFolder}>
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete document?">
        <p className="text-sm text-muted mb-4">
          This permanently deletes <strong>{toDelete?.file_name}</strong>. This cannot be undone.
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
