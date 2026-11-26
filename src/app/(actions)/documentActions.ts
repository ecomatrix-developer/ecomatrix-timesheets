"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireSession, requireSuperAdminOrAccountant, canAccessEmployeeDocuments } from "@/lib/session";
import { getDocumentById, getDocumentFolderById } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "employee-documents";

export interface UploadDocumentState {
  error?: string;
  success?: boolean;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

/**
 * Super-Admin or Accountant. Uploads a file for one specific employee,
 * inside one specific folder, into the private employee-documents bucket,
 * then records it. Will fail with a friendly message if
 * supabase_patch_8_documents.sql hasn't been run yet (missing table/
 * bucket).
 */
export async function uploadDocumentAction(
  employeeId: string,
  folderId: string,
  _prevState: UploadDocumentState,
  formData: FormData
): Promise<UploadDocumentState> {
  const session = await requireSuperAdminOrAccountant();

  const file = formData.get("file");

  if (!folderId) {
    return { error: "Open a folder first — files can't be uploaded at the top level." };
  }
  const folder = await getDocumentFolderById(folderId);
  if (!folder || folder.employee_id !== employeeId) {
    return { error: "That folder no longer exists." };
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

  // Abeer, 2026-11-27: "the name of file will be shown there" — the
  // folder-based UI doesn't collect a separate title anymore, the
  // uploaded file's own name IS the title.
  const { error: insertError } = await supabaseAdmin.from("employee_documents").insert({
    employee_id: employeeId,
    uploaded_by: session.userId,
    category: null,
    folder_id: folderId,
    title: file.name,
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

/** Super-Admin or Accountant. Removes both the storage object and its DB row. */
export async function deleteDocumentAction(
  documentId: string
): Promise<{ success: boolean; message: string }> {
  await requireSuperAdminOrAccountant();

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
 * Super-Admin or Accountant (supabase_patch_24) — creates a named folder
 * inside one employee's document space. Abeer, 2026-11-27: "create a
 * folder and name that folder and we can go inside that folder and
 * upload the document."
 */
export async function createDocumentFolderAction(
  employeeId: string,
  name: string
): Promise<{ success: boolean; message: string; folderId?: string }> {
  const session = await requireSuperAdminOrAccountant();

  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "Folder name is required." };
  if (trimmed.length > 100) return { success: false, message: "Folder name is too long." };

  const { data, error } = await supabaseAdmin
    .from("document_folders")
    .insert({ employee_id: employeeId, name: trimmed, created_by: session.userId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { success: false, message: "A folder with that name already exists." };
    if (error.code === "PGRST205") {
      return { success: false, message: "Folders haven't been set up yet. Contact your developer, then try again." };
    }
    return { success: false, message: error.message };
  }

  revalidatePath(`/manage_documents/${employeeId}`);
  revalidateTag("documents");
  return { success: true, message: "Folder created.", folderId: data.id };
}

/**
 * Super-Admin or Accountant. Refuses to delete a folder that still has
 * documents in it (the DB's ON DELETE RESTRICT on employee_documents.
 * folder_id surfaces as a foreign-key-violation error, caught below) —
 * move or delete the files inside first.
 */
export async function deleteDocumentFolderAction(
  folderId: string
): Promise<{ success: boolean; message: string }> {
  await requireSuperAdminOrAccountant();

  const folder = await getDocumentFolderById(folderId);
  if (!folder) return { success: false, message: "Folder not found." };

  const { error } = await supabaseAdmin.from("document_folders").delete().eq("id", folderId);
  if (error) {
    if (error.code === "23503") {
      return { success: false, message: "This folder still has files in it — delete those first." };
    }
    return { success: false, message: error.message };
  }

  revalidatePath(`/manage_documents/${folder.employee_id}`);
  revalidateTag("documents");
  return { success: true, message: "Folder deleted." };
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
