import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { AccessLevel, SessionPayload, UserType } from "./types";

const SESSION_COOKIE = "ts_session";
// Idle timeout, not a flat session lifetime: middleware re-signs the token
// with a fresh expiry on every authenticated request, so the clock only
// runs out after this many seconds pass with NO requests at all. 30 min
// of actual inactivity logs the user out and requires signing in again.
export const SESSION_DURATION_SECONDS = 60 * 30;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a long random value in .env.local."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.userId === "string" &&
      typeof payload.username === "string" &&
      typeof payload.name === "string" &&
      (payload.role === "admin" || payload.role === "employee")
    ) {
      return {
        userId: payload.userId,
        username: payload.username,
        name: payload.name,
        role: payload.role,
        // Optional v3.0 fields — only present once a user has logged in
        // again after the role migration (patch_7) has been run. Older
        // still-valid sessions simply won't carry these, which is exactly
        // why every check below falls back to `role` instead of assuming
        // they exist.
        accessLevel: payload.accessLevel as AccessLevel | null | undefined,
        userType: payload.userType as UserType | null | undefined,
        jobTitle: (payload.jobTitle as string | null | undefined) ?? undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

// --- v3.0 access-level helpers -------------------------------------------
// These layer on top of the untouched requireAdmin()/role checks above —
// nothing existing calls these yet, so adding them changes no behavior
// for any page until it's explicitly switched over. Every one of them
// falls back to the legacy `role` field when accessLevel isn't present on
// the session (i.e. before patch_7 has been run and re-logged-in), so a
// page gated on isAdminOrAbove() behaves identically to the old
// `role === "admin"` check until the new field actually shows up.
export function isSuperAdmin(session: SessionPayload): boolean {
  return session.accessLevel === "super_admin";
}

export function isAdminOrAbove(session: SessionPayload): boolean {
  if (session.accessLevel) {
    return session.accessLevel === "admin" || session.accessLevel === "super_admin";
  }
  return session.role === "admin";
}

export async function requireSuperAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isSuperAdmin(session)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

// For the screens the brief marks Super-Admin-only even though today's
// `role` column can't tell Admin from Super Admin (both sync to 'admin').
// Falls back to the old role === "admin" check when accessLevel hasn't
// been assigned yet, so behavior is unchanged for anyone not yet migrated
// — but once a session carries an explicit accessLevel, only
// "super_admin" passes, correctly excluding a plain Admin.
export function isSuperAdminOnly(session: SessionPayload): boolean {
  if (session.accessLevel) return session.accessLevel === "super_admin";
  return session.role === "admin";
}

export async function requireSuperAdminOnly(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isSuperAdminOnly(session)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

// A document belonging to `employeeId` is visible only to that employee
// themselves and to a Super Admin — nobody else, including a plain Admin
// (matches the brief's "No access to other people's personal documents"
// rule, and Abeer's explicit instruction that nobody but the employee and
// Super Admin can ever see their documents). Uses the strict isSuperAdmin
// (no legacy-role fallback) deliberately: documents are a brand-new
// feature with no prior "admin could already see these" behavior to stay
// compatible with, so there's no reason to admit a not-yet-migrated
// legacy admin here the way isSuperAdminOnly does for older pages.
export function canAccessEmployeeDocuments(session: SessionPayload, employeeId: string): boolean {
  return session.userId === employeeId || isSuperAdmin(session);
}
