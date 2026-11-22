"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireSuperAdminOnly } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Abeer, 2026-11-22: "create the client creation page for the super admin
// as well" — clients (supabase_patch_9) previously had no management UI
// at all; they could only ever be seeded/edited directly in the database.
// getAllClients() is cached for 10 minutes (src/lib/data.ts, tagged
// "reference-data") since it's seed data everywhere ELSE — but now that
// this page can actually change it, every write here busts that tag so a
// newly added client shows up on Create/Edit Project immediately instead
// of up to 10 minutes later.

export async function createClientAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireSuperAdminOnly();

  const name = String(formData.get("name") ?? "").trim();
  const shortCode = String(formData.get("short_code") ?? "").trim();
  if (!name) return { success: false, error: "Client name is required." };
  if (!shortCode) return { success: false, error: "Short code is required." };

  const { error } = await supabaseAdmin.from("clients").insert({
    name,
    short_code: shortCode,
    active: true,
  });
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: `A client with short code "${shortCode}" already exists.` };
    }
    return { success: false, error: error.message };
  }

  revalidateTag("reference-data");
  revalidatePath("/clients");
  return { success: true };
}

export async function updateClientAction(
  clientId: string,
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireSuperAdminOnly();

  const name = String(formData.get("name") ?? "").trim();
  const shortCode = String(formData.get("short_code") ?? "").trim();
  if (!name) return { success: false, error: "Client name is required." };
  if (!shortCode) return { success: false, error: "Short code is required." };

  const { error } = await supabaseAdmin
    .from("clients")
    .update({ name, short_code: shortCode })
    .eq("id", clientId);
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: `A client with short code "${shortCode}" already exists.` };
    }
    return { success: false, error: error.message };
  }

  revalidateTag("reference-data");
  revalidatePath("/clients");
  return { success: true };
}

// Soft-deactivate only — clients are referenced by projects via a
// foreign key, so a hard delete here could either fail outright or (worse)
// silently orphan/cascade into existing projects. Deactivating removes it
// from the Create/Edit Project client pickers (filtered to active-only in
// those two page.tsx files) without touching any project that already
// references it.
export async function setClientActiveAction(
  clientId: string,
  active: boolean
): Promise<{ success: boolean; error?: string }> {
  await requireSuperAdminOnly();

  const { error } = await supabaseAdmin.from("clients").update({ active }).eq("id", clientId);
  if (error) return { success: false, error: error.message };

  revalidateTag("reference-data");
  revalidatePath("/clients");
  return { success: true };
}
