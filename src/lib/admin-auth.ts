/**
 * Admin access. The secret link /admin?token=… is exchanged (in middleware)
 * for a short-lived, HMAC-signed, httpOnly cookie, and the token is stripped
 * from the URL. API routes accept that cookie or an `Authorization: Bearer`
 * header. Never log the token or include it in error messages.
 *
 * No `server-only` import here because middleware also uses this module;
 * it must still never be imported from a client component.
 */
import { appSecret, hmacHex, safeEqual, sha256Hex } from "@/lib/crypto";

export const ADMIN_COOKIE = "seale_admin";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

function adminToken(): string | null {
  const t = process.env.ADMIN_TOKEN;
  return t && t.length >= 16 ? t : null; // fail closed if unset or weak
}

export async function verifyAdminToken(candidate: string | null | undefined): Promise<boolean> {
  const expected = adminToken();
  if (!expected || typeof candidate !== "string" || candidate.length === 0 || candidate.length > 512) {
    return false;
  }
  return safeEqual(candidate, expected);
}

async function sessionSignature(exp: number): Promise<string> {
  // Bound to the current token, so rotating ADMIN_TOKEN invalidates all sessions.
  const tokenFingerprint = await sha256Hex(adminToken() ?? "");
  return hmacHex(appSecret(), `admin-session:${exp}:${tokenFingerprint}`);
}

export async function createSessionValue(nowMs: number = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + ADMIN_SESSION_SECONDS;
  return `${exp}.${await sessionSignature(exp)}`;
}

export async function verifySessionValue(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!adminToken() || !value || value.length > 200) return false;
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(value);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp * 1000 < nowMs) return false;
  return safeEqual(m[2], await sessionSignature(exp));
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** For Route Handlers: bearer token or session cookie. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return verifyAdminToken(auth.slice(7).trim());
  return verifySessionValue(readCookie(req.headers.get("cookie"), ADMIN_COOKIE));
}
