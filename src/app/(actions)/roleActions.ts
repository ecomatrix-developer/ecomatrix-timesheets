"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireSuperAdminOnly } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AccessLevel, UserType } from "@/lib/types";

export interface UpdateUserRoleState {
  error?: string;
  success?: boolean;
}

const ACCESS_LEVELS: AccessLevel[] = ["super_admin", "admin", "user"];
const USER_TYPES: UserType[] = ["employee", "intern", "consultant", "accountant", "marketing_bd"];

/**
 * Super-Admin-only. Updates a single user's v3.0 role fields. Will fail
 * with a friendly message (instead of a raw Postgres error) if
 * supabase_patch_7_roles_v3.sql hasn't been run against this DB yet — that
 * migration adds the access_level/user_type/job_title/email columns this
 * writes to, and isn't applied automatically by this app.
 */
export async function updateUserRoleAction(
  userId: string,
  formData: FormData
): Promise<UpdateUserRoleState> {
  await requireSuperAdminOnly();

  const accessLevel = String(formData.get("access_level") ?? "");
  const userType = String(formData.get("user_type") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();

  if (!ACCESS_LEVELS.includes(accessLevel as AccessLevel)) {
    return { error: "Invalid access level." };
  }
  if (!USER_TYPES.includes(userType as UserType)) {
    return { error: "Invalid user type." };
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      access_level: accessLevel,
      user_type: userType,
      email: email || null,
      job_title: jobTitle || null,
    })
    .eq("id", userId);

  if (error) {
    // PGRST204 is PostgREST's own "unknown column" error (it resolves
    // columns via its schema cache before the write ever reaches
    // Postgres) — checked live against a genuinely missing column
    // (see documentActions.ts's matching PGRST205 fix for the missing-
    // table case). 42703 kept as a fallback in case a differently-shaped
    // error ever reaches here some other way.
    if (error.code === "PGRST204" || error.code === "42703") {
      return {
        error: "Role management hasn't been set up yet. Contact your developer, then try again.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/manage_roles");
  revalidateTag("users");
  return { success: true };
}
