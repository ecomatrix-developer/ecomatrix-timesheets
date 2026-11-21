"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getUserByUsername } from "@/lib/data";
import { createSession, destroySession } from "@/lib/session";
import { sendPlainEmail } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Username and password are required." };
  }

  const user = await getUserByUsername(username);
  if (!user) {
    return { error: "Invalid credentials" };
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return { error: "Invalid credentials" };
  }

  await createSession({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    // Undefined on every user until supabase_patch_7_roles_v3.sql has run
    // (the columns won't exist yet, so getUserByUsername's select("*")
    // simply won't return them) — createSession/getSession already treat
    // that as "fall back to role", so this line is a no-op today and
    // starts working the moment the migration + backfill land.
    accessLevel: user.access_level,
    userType: user.user_type,
    jobTitle: user.job_title,
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
}

export interface PasswordResetRequestState {
  submitted?: boolean;
}

/**
 * Replaces v1/v2's fake "Forgot Password?" modal (which only ever showed a
 * static message, no backend call at all — see LoginForm.tsx's own old
 * comment). This one stores the request (supabase_patch_15) in the same
 * inbox Contact Us uses — so it shows up in the Super Admin notification
 * bell and on /contact_submissions, not just an easy-to-miss email — and
 * best-effort emails a Super Admin too, reusing the same SMTP path
 * Contact Us already uses.
 *
 * Deliberately not a self-service reset: there's no password stored or
 * recoverable in plain text anywhere, by design (bcrypt is one-way), so a
 * Super Admin sets a genuinely new password via the Employees & Roles
 * page's Reset Password action and relays it to the employee directly.
 * This just notifies them that someone is asking.
 *
 * No session required — the whole point is the person can't log in — and
 * the response is identical whether or not the username exists, so this
 * can't be used to probe for valid usernames.
 */
export async function requestPasswordResetAction(
  username: string
): Promise<PasswordResetRequestState> {
  const trimmed = username.trim();
  if (trimmed) {
    const user = await getUserByUsername(trimmed);
    if (user) {
      await supabaseAdmin
        .from("contact_submissions")
        .insert({
          user_id: user.id,
          username: user.username,
          name: user.name,
          subject: "Password reset requested",
          message: `${user.name} (${user.username}) requested a password reset from the login page.`,
          source: "password_reset",
        })
        .then(() => {}, () => {}); // best-effort — a missing table pre-migration must never block the generic response below

      const recipients = [process.env.OWNER_EMAIL, process.env.ADMIN_EMAIL].filter(
        (v): v is string => !!v
      );
      if (recipients.length > 0) {
        await sendPlainEmail(
          recipients,
          `[Timesheet App] Password reset requested: ${user.username}`,
          `${user.name} (${user.username}) requested a password reset from the login page.\n\nReset it from Employees & Roles and share the new password with them directly.`
        ).catch(() => {});
      }
    }
  }
  return { submitted: true };
}
