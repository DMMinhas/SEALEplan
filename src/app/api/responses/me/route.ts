import { getDb } from "@/lib/db";
import { ensurePoll, getResponseByToken } from "@/lib/repo";
import { checkRateLimit, clientIp, errorJson, json, readJson } from "@/lib/http";
import { editTokenSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Loads the caller's own response using the edit token stored in their browser. */
export async function POST(req: Request): Promise<Response> {
  const db = getDb();
  const limit = await checkRateLimit(db, clientIp(req));
  if (!limit.ok) {
    return json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }
  const parsed = editTokenSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "invalid_request");

  const poll = await ensurePoll(db);
  const response = await getResponseByToken(db, poll.id, parsed.data.editToken);
  if (!response) return errorJson(404, "not_found");

  return json({
    response: {
      name: response.name,
      organization: response.organization,
      country: response.country,
      timezone: response.timezone,
      updatedAt: response.updatedAt,
      slots: response.slots,
    },
  });
}
