import "server-only";
import { pollConfig } from "@/config/poll.config";
import type { Db } from "@/lib/db";
import { appSecret, hmacHex } from "@/lib/crypto";
import { isAdminRequest } from "@/lib/admin-auth";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...(init.headers ?? {}) } });
}

export const errorJson = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  json({ error, ...extra }, { status });

export const unauthorized = () => errorJson(401, "unauthorized");

export async function requireAdmin(req: Request): Promise<Response | null> {
  return (await isAdminRequest(req)) ? null : unauthorized();
}

const MAX_BODY_BYTES = 32 * 1024;

/** Parses a JSON body with a size cap. Returns undefined on any problem. */
export async function readJson(req: Request): Promise<unknown | undefined> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return undefined;
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Client IP as set by Vercel's edge (x-real-ip / first x-forwarded-for entry). */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}

/**
 * Fixed-window rate limit kept in Postgres (works across serverless
 * instances). Only an HMAC of the IP is stored.
 */
export async function checkRateLimit(
  db: Db,
  ip: string,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const { maxRequests, windowSeconds } = pollConfig.rateLimit;
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const bucket = await hmacHex(appSecret(), `rate-limit:${ip}`);
  const rows = await db.query<{ hits: number }>(
    `insert into rate_limit (bucket_key, window_start, hits) values ($1, $2::timestamptz, 1)
     on conflict (bucket_key, window_start) do update set hits = rate_limit.hits + 1
     returning hits`,
    [bucket, new Date(windowStart).toISOString()],
  );
  if (Math.random() < 0.05) {
    await db.query(`delete from rate_limit where window_start < now() - interval '1 day'`);
  }
  if (Number(rows[0].hits) > maxRequests) {
    return { ok: false, retryAfter: Math.ceil((windowStart + windowMs - now) / 1000) };
  }
  return { ok: true };
}
