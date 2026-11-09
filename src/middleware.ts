import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  createSessionValue,
  verifyAdminToken,
} from "@/lib/admin-auth";

/**
 * Exchanges /admin?token=… for an httpOnly session cookie and redirects to a
 * clean /admin URL, so the token does not stay in the address bar, history or
 * Referer headers. The token is never logged.
 */
export async function middleware(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token === null) return NextResponse.next();

  const target = req.nextUrl.clone();
  target.search = "";
  const ok = await verifyAdminToken(token);
  if (!ok) target.searchParams.set("denied", "1");

  const res = NextResponse.redirect(target, 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  if (ok) {
    res.cookies.set(ADMIN_COOKIE, await createSessionValue(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_SESSION_SECONDS,
    });
  }
  return res;
}

export const config = { matcher: ["/admin"] };
