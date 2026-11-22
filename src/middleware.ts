import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";

// Lightweight, edge-safe gate: verifies the session cookie's JWT and, on
// every authenticated request, slides its expiry forward — this is what
// actually implements the 30-minute IDLE timeout (not a flat session
// lifetime): the token's `exp` only gets reached if 30 minutes pass with
// NO requests at all. Full session-payload shape validation + role checks
// still happen in each Server Component/Action via getSession()/
// requireAdmin() — this middleware is defense-in-depth, not the sole
// authorization boundary.
const PUBLIC_PATHS = ["/login", "/api/health"];
const SESSION_COOKIE = "ts_session";
const SESSION_DURATION_SECONDS = 60 * 30; // keep in sync with src/lib/session.ts

// Found during the 2026-11-22 role-based security stress test: a
// continuously-active session was carrying its role/access_level/user_type
// FOREVER, straight from the one JWT signed at login — the idle-timeout
// slide above re-signs the SAME payload it already had, never re-checking
// the DB. So if a Super Admin demotes someone (or changes their user_type,
// or deletes them) while they're actively using the app, that change
// never takes effect for them as long as they keep clicking around inside
// the 30-minute idle window — a real stale-privilege gap, not just a
// theoretical one. Fixed by re-reading the user's row from the DB and
// re-signing with CURRENT values at most once per REVALIDATE_MS — cheap
// (skipped on every other request) but bounds how long a revoked/changed
// role can still apply. A row that's gone entirely (deleted account) logs
// the session out immediately instead of limping along on stale data.
const REVALIDATE_MS = 2 * 60 * 1000; // 2 minutes

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short.");
  }
  return new TextEncoder().encode(secret);
}

interface RevalidatedUser {
  username: string;
  name: string;
  role: string;
  access_level: string | null;
  user_type: string | null;
  job_title: string | null;
}

async function fetchCurrentUser(userId: string): Promise<RevalidatedUser | null | undefined> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined; // misconfigured — fail open, don't lock everyone out

  try {
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=username,name,role,access_level,user_type,job_title`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    if (!res.ok) return undefined; // transient Supabase error — fail open
    const rows = (await res.json()) as RevalidatedUser[];
    return rows[0] ?? null; // null = row genuinely gone (deleted account)
  } catch {
    return undefined; // network error — fail open
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    if (pathname === "/") return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify the existing token and, if still valid, re-sign it with a fresh
  // 30-minute expiry (the sliding window). An expired or tampered token
  // falls through to the catch below, clears the stale cookie, and sends
  // the user back to login with a reason the login page can surface.
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const userId = payload.userId as string | undefined;
    const validatedAt = typeof payload.validatedAt === "number" ? payload.validatedAt : 0;
    const dueForRevalidation = Date.now() - validatedAt > REVALIDATE_MS;

    let nextPayload = payload;
    if (userId && dueForRevalidation) {
      const current = await fetchCurrentUser(userId);
      if (current === null) {
        // Account no longer exists — don't let a deleted user's old
        // session keep working.
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("reason", "revoked");
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete(SESSION_COOKIE);
        return response;
      }
      if (current) {
        nextPayload = {
          ...payload,
          username: current.username,
          name: current.name,
          role: current.role,
          accessLevel: current.access_level,
          userType: current.user_type,
          jobTitle: current.job_title,
          validatedAt: Date.now(),
        };
      }
      // current === undefined (fetch failed) — keep the existing payload,
      // fail open rather than locking everyone out over a transient error.
    }

    const freshToken = await new SignJWT(nextPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
      .sign(getSecretKey());

    const response = NextResponse.next();
    response.cookies.set(SESSION_COOKIE, freshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });
    return response;
  } catch {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "timeout");
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
