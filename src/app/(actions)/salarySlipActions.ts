"use server";

import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireSuperAdminOrAccountant } from "@/lib/session";
import { getUserById } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderPdfInChildProcess } from "@/lib/pdf/renderInChildProcess";
import { SALARY_SLIP_FOLDER_NAME, salarySlipFileName, type SalarySlipFormData } from "@/lib/salarySlip";
import type { SalarySlipDocumentProps } from "@/lib/pdf/SalarySlipDocument";

const BUCKET = "employee-documents";

export interface GenerateSalarySlipResult {
  success: boolean;
  message: string;
  documentId?: string;
  /** Only set for mode: "download" — base64 PDF bytes for the browser to save directly. */
  pdfBase64?: string;
  fileName?: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

/**
 * Super-Admin or Accountant — builds the salary-slip PDF (same
 * @react-pdf/renderer child-process path as the weekly backup/owner
 * report PDFs; see renderInChildProcess.ts).
 *
 * Abeer, 2026-11-28: "give there an option to automatically send that to
 * emps folders and one to just download that. so that its on user what he
 * wants to do" — mode "send" (default) files the PDF into the employee's
 * own "Salary Slips" folder, reusing the existing employee_documents/
 * document_folders tables (supabase_patch_8/24) so it shows up immediately
 * in THEIR My Documents only — nobody else's. Mode "download" renders the
 * identical PDF but never touches storage or the documents tables at all;
 * it's handed back as base64 for the browser to save locally, nothing is
 * persisted anywhere.
 */
export async function generateSalarySlipAction(
  form: SalarySlipFormData,
  mode: "send" | "download" = "send"
): Promise<GenerateSalarySlipResult> {
  const session = await requireSuperAdminOrAccountant();

  if (!form.employeeId) return { success: false, message: "Choose an employee." };
  const employee = await getUserById(form.employeeId);
  if (!employee) return { success: false, message: "That employee no longer exists." };
  if (!form.employeeName.trim()) return { success: false, message: "Employee name is required." };
  if (!form.month) return { success: false, message: "Choose a month." };

  const generatedAtIso = new Date().toISOString();
  // @react-pdf/renderer's Node image loader fetch()es any plain string src
  // — a filesystem path isn't a URL and fails outright — so the logo has
  // to cross as inline base64 data instead of a path. Abeer, 2026-11-28:
  // "for the logo inside the salary slips add the old logo... make sure
  // its without bg" — salary-slip-logo.png is that file with its baked-in
  // white background keyed out to transparent (see the sibling
  // public/old logo.png it was derived from).
  const logoBuffer = await readFile(path.join(process.cwd(), "public", "salary-slip-logo.png"));
  const logoDataUri = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const docProps: SalarySlipDocumentProps = {
    employeeName: form.employeeName.trim(),
    location: form.location.trim(),
    roleTitle: form.roleTitle.trim(),
    dateOfJoining: form.dateOfJoining,
    month: form.month,
    slipType: form.slipType || "Salary",
    earnings: form.earnings,
    deductions: form.deductions,
    leaveRows: form.leaveRows,
    leaveBalanceAsOn: form.leaveBalanceAsOn,
    authorizedName: form.authorizedName || "Mr. Anup Rathi",
    authorizedTitle: form.authorizedTitle || "Partner",
    ackPlace: form.ackPlace || "Nagpur",
    generatedAtIso,
    logoDataUri,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdfInChildProcess(
      "lib/pdf/SalarySlipDocument.tsx",
      "SalarySlipDocument",
      docProps
    );
  } catch (err) {
    return { success: false, message: `Could not generate the PDF: ${(err as Error).message}` };
  }

  const fileName = salarySlipFileName(form.employeeName, form.month);

  if (mode === "download") {
    return {
      success: true,
      message: "Salary slip generated.",
      pdfBase64: pdfBuffer.toString("base64"),
      fileName,
    };
  }

  let folderId: string;
  const { data: existingFolder, error: findErr } = await supabaseAdmin
    .from("document_folders")
    .select("id")
    .eq("employee_id", form.employeeId)
    .eq("name", SALARY_SLIP_FOLDER_NAME)
    .maybeSingle();
  if (findErr) {
    if (findErr.code === "PGRST205") {
      return {
        success: false,
        message: "The document portal hasn't been set up yet. Contact your developer, then try again.",
      };
    }
    return { success: false, message: findErr.message };
  }
  if (existingFolder) {
    folderId = existingFolder.id;
  } else {
    const { data: created, error: createErr } = await supabaseAdmin
      .from("document_folders")
      .insert({ employee_id: form.employeeId, name: SALARY_SLIP_FOLDER_NAME, created_by: session.userId })
      .select("id")
      .single();
    if (createErr) return { success: false, message: createErr.message };
    folderId = created.id;
  }

  const storagePath = `${form.employeeId}/${randomUUID()}-${sanitizeFileName(fileName)}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    if (uploadError.message?.toLowerCase().includes("bucket not found")) {
      return {
        success: false,
        message: "The document portal hasn't been set up yet. Contact your developer, then try again.",
      };
    }
    return { success: false, message: uploadError.message };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("employee_documents")
    .insert({
      employee_id: form.employeeId,
      uploaded_by: session.userId,
      category: null,
      folder_id: folderId,
      title: fileName,
      storage_path: storagePath,
      file_name: fileName,
      file_size: pdfBuffer.length,
      mime_type: "application/pdf",
    })
    .select("id")
    .single();
  if (insertError) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    return { success: false, message: insertError.message };
  }

  revalidatePath(`/manage_documents/${form.employeeId}`);
  revalidatePath("/my_documents");
  revalidatePath("/salary_slips");
  revalidateTag("documents");

  return {
    success: true,
    message: `Salary slip generated and sent to ${form.employeeName}'s My Documents.`,
    documentId: inserted.id,
  };
}
