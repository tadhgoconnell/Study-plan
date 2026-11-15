import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, passwordRequired, safeEqual, sessionToken } from "@/lib/auth";

/** When APP_PASSWORD is set, everything except the login page needs a valid session cookie. */
export function proxy(request: NextRequest) {
  if (!passwordRequired()) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, sessionToken())) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
