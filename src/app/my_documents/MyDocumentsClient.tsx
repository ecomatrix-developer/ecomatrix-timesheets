"use client";

import { useState } from "react";
import type { EmployeeDocument } from "@/lib/types";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/constants";
import { getDocumentDownloadUrlAction } from "@/app/(actions)/documentActions";
import { toast } from "@/lib/toast";
import { FaFileAlt, FaDownload, FaLock } from "react-icons/fa";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
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

export default function MyDocumentsClient({ documents }: { documents: EmployeeDocument[] }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
        <FaLock className="h-3 w-3 shrink-0" /> Only you and Super Admin can see these. Uploaded
        by Super Admin — letters, salary slips and personal documents.
      </p>

      <div className="glass !p-0 overflow-hidden">
        {documents.length === 0 ? (
          <p className="text-sm text-muted text-center py-10">
            No documents have been uploaded for you yet.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {documents.map((doc) => (
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
        )}
      </div>
    </div>
  );
}
