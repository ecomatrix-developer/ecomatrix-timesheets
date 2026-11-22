"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireSession, requireSuperAdmin, canAccessEmployeeDocuments } from "@/lib/session";
import { getDocumentById } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { DocumentCategory } from "@/lib/types";

const BUCKET = "employee-documents";

const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "salary_slip",
  "offer_letter",
  "appointment_letter",
  "confirmation_letter",
  "increment_letter",
  "nda",
  "id_proof",
  "address_proof",
  "bank_document",
  "other",
];

export interface UploadDocumentState {
  error?: string;
  success?: boolean;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

/**
 * Super-Admin-only. Uploads a file for one specific employee into the
 * private employee-documents bucket, then records it. Will fail with a
 * friendly message if supabase_patch_8_documents.sql hasn't been run yet
 * (missing table/bucket).
 */
export async function uploadDocumentAction(
  employeeId: string,
  _prevState: UploadDocumentState,
  formData: FormData
): Promise<UploadDocumentState> {
  const session = await requireSuperAdmin();

  const category = String(formData.get("category") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!DOCUMENT_CATEGORIES.includes(category as DocumentCategory)) {
    return { error: "Invalid document category." };
  }
  if (!title) {
    return { error: "Title is required." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { error: "File is larger than the 15MB limit." };
  }

  const storagePath = `${employeeId}/${randomUUID()}-${sanitizeFileName(file.name)}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    if (uploadError.message?.toLowerCase().includes("bucket not found")) {
      return {
        error: "The document portal hasn't been set up yet. Contact your developer, then try again.",
      };
    }
    return { error: uploadError.message };
  }

  const { error: insertError } = await supabaseAdmin.from("employee_documents").insert({
    employee_id: employeeId,
    uploaded_by: session.userId,
    category,
    title,
    storage_path: storagePath,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type || null,
  });
  if (insertError) {
    // Clean up the orphaned storage object rather than leaving a file
    // nobody can ever reach through the app.
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    if (insertError.code === "PGRST205") {
      return {
        error: "The document portal hasn't been set up yet. Contact your developer, then try again.",
      };
    }
    return { error: insertError.message };
  }

  revalidatePath(`/manage_documents/${employeeId}`);
  revalidateTag("documents");
  return { success: true };
}

/** Super-Admin-only. Removes both the storage object and its DB row. */
export async function deleteDocumentAction(
  documentId: string
): Promise<{ success: boolean; message: string }> {
  await requireSuperAdmin();

  const doc = await getDocumentById(documentId);
  if (!doc) return { success: false, message: "Document not found." };

  await supabaseAdmin.storage.from(BUCKET).remove([doc.storage_path]);
  const { error } = await supabaseAdmin.from("employee_documents").delete().eq("id", documentId);
  if (error) return { success: false, message: error.message };

  revalidatePath(`/manage_documents/${doc.employee_id}`);
  revalidateTag("documents");
  return { success: true, message: "Document deleted." };
}

/**
 * Callable by the document's own employee or a Super Admin only — see
 * canAccessEmployeeDocuments. Returns a 60-second signed URL and logs the
 * download (brief's privacy rule: log who downloads a document).
 */
export async function getDocumentDownloadUrlAction(
  documentId: string
): Promise<{ url?: string; error?: string }> {
  const session = await requireSession();

  const doc = await getDocumentById(documentId);
  if (!doc) return { error: "Document not found." };
  if (!canAccessEmployeeDocuments(session, doc.employee_id)) {
    return { error: "You don't have access to this document." };
  }

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 60);
  if (error) return { error: error.message };

  await supabaseAdmin.from("employee_document_downloads").insert({
    document_id: documentId,
    downloaded_by: session.userId,
  });

  return { url: data.signedUrl };
}
