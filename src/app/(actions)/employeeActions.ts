"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface CreateEmployeeState {
  error?: string;
  success?: boolean;
}

export async function createEmployeeAction(
  _prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  await requireAdmin();

  const username = String(formData.get("username") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !name || !password) {
    return { error: "Username, name and password are all required." };
  }

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) {
    return { error: "Username already exists" };
  }

  // Bcrypt-hash on creation, matching the migrated data's hashing scheme —
  // v1 stored plaintext passwords; v2 never does, for new or migrated users.
  const passwordHash = await bcrypt.hash(password, 10);

  const { error } = await supabaseAdmin.from("users").insert({
    username,
    name,
    password_hash: passwordHash,
    role: "employee",
  });
  if (error) return { error: error.message };

  revalidatePath("/create_employee");
  return { success: true };
}

/** Cascades across timesheet_entries/submitted_days/submitted_weeks/users. */
export async function deleteEmployeeAction(username: string): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  if (username === "admin") {
    return { success: false, message: "Cannot delete admin" };
  }

  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!user) return { success: false, message: "User not found" };

  // The DB's ON DELETE CASCADE from timesheet_entries/submitted_days/
  // submitted_weeks to users.id handles the cascade automatically, but we
  // delete explicitly too for clarity and to match v1's behavior precisely
  // even if the FK constraints ever change.
  await supabaseAdmin.from("timesheet_entries").delete().eq("employee_id", user.id);
  await supabaseAdmin.from("submitted_days").delete().eq("employee_id", user.id);
  await supabaseAdmin.from("submitted_weeks").delete().eq("employee_id", user.id);
  const { error } = await supabaseAdmin.from("users").delete().eq("id", user.id);
  if (error) throw error;

  revalidatePath("/create_employee");
  return { success: true, message: `User ${username} and all their data has been deleted.` };
}
