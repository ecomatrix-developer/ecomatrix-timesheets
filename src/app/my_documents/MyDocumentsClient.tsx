"use client";

import { useMemo, useState } from "react";
import type { EmployeeDocument, DocumentFolder } from "@/lib/types";
import { getDocumentDownloadUrlAction } from "@/app/(actions)/documentActions";
import { toast } from "@/lib/toast";
import { FaFileAlt, FaFolder, FaDownload, FaLock } from "react-icons/fa";

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

export default function MyDocumentsClient({
  documents,
  folders,
}: {
  documents: EmployeeDocument[];
  folders: DocumentFolder[];
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Abeer, 2026-11-27: documents are now organized into folders (see
  // ManageDocumentsClient) — read-only here, just grouped the same way so
  // this page stays consistent with what Super Admin/Accountant see.
  const groups = useMemo(() => {
    const byFolder = new Map<string, EmployeeDocument[]>();
    const uncategorized: EmployeeDocument[] = [];
    for (const d of documents) {
      if (!d.folder_id) {
        uncategorized.push(d);
        continue;
      }
      const list = byFolder.get(d.folder_id) ?? [];
      list.push(d);
      byFolder.set(d.folder_id, list);
    }
    const named = folders
      .map((f) => ({ name: f.name, docs: byFolder.get(f.id) ?? [] }))
      .filter((g) => g.docs.length > 0);
    if (uncategorized.length > 0) named.push({ name: "Uncategorized", docs: uncategorized });
    return named;
  }, [documents, folders]);

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

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold mb-2 flex items-center gap-2">
        <FaFileAlt className="text-accent" /> My Documents
      </h1>
      <p className="text-sm text-muted mb-6 max-w-2xl flex items-center gap-2">
        <FaLock className="h-3 w-3 shrink-0" /> Only you, Super Admin, and Accountant can see these.
        Uploaded by Super Admin/Accountant — letters, salary slips and personal documents.
      </p>

      {groups.length === 0 ? (
        <div className="glass p-10 text-center text-muted">
          No documents have been uploaded for you yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.name} className="glass !p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <FaFolder className="h-4 w-4 text-accent" />
                <h2 className="font-semibold text-sm">{group.name}</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {group.docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
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
                      className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0"
                    >
                      <FaDownload className="h-3 w-3" />{" "}
                      {downloadingId === doc.id ? "Preparing…" : "Download"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
