import { getDb } from "@/lib/db";
import { ensurePoll, PollClosedError, upsertResponse } from "@/lib/repo";
import { checkRateLimit, clientIp, errorJson, json, readJson } from "@/lib/http";
import { issuesToFields, submissionSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const db = getDb();

  const limit = await checkRateLimit(db, clientIp(req));
  if (!limit.ok) {
    return json(
      {
        error: "rate_limited",
        message: "Too many submissions from this network. Please try again in a few minutes.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const body = await readJson(req);
  if (body === undefined) return errorJson(400, "invalid_json");

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(422, "validation", { fields: issuesToFields(parsed.error) });
  }
  const data = parsed.data;

  // Honeypot: pretend success so bots learn nothing; nothing is stored.
  if (data.company_website && data.company_website.trim() !== "") {
    return json({ ok: true, editToken: null, replacedByName: false });
  }

  const poll = await ensurePoll(db);
  if (poll.closed) return errorJson(403, "poll_closed", { message: "This poll is closed." });

  try {
    const result = await upsertResponse(db, poll.id, {
      name: data.name,
      organization: data.organization,
      country: data.country,
      timezone: data.timezone,
      slots: data.slots,
      editToken: data.editToken ?? null,
    });
    return json(
      {
        ok: true,
        editToken: result.editToken,
        created: result.created,
        replacedByName: result.replacedByName,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (e) {
    if (e instanceof PollClosedError) {
      return errorJson(403, "poll_closed", { message: "This poll is closed." });
    }
    throw e;
  }
}
