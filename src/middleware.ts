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
//
// 2026-11-22: this used to also re-check the user's role against the DB
// every 2 minutes, closing a gap where a demoted/deleted account could
// keep working on its old session for up to 30 minutes of continued
// activity. Pulled back out at Abeer's request — it was adding a blocking
// database round trip to page loads, and for a small internal team the
// 30-minute window is an acceptable trade for not paying that cost. The
// gap itself is explained, not silently reintroduced: revoking someone's
// access while they're actively using the app can take up to 30 minutes
// of their continued activity (not instantly) to actually apply.
const PUBLIC_PATHS = ["/login", "/api/health"];
const SESSION_COOKIE = "ts_session";
const SESSION_DURATION_SECONDS = 60 * 30; // keep in sync with src/lib/session.ts

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short.");
  }
  return new TextEncoder().encode(secret);
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
    const freshToken = await new SignJWT(payload)
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
