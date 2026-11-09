import { getDb } from "@/lib/db";
import { ensurePoll, setDeadline } from "@/lib/repo";
import { errorJson, json, readJson, requireAdmin } from "@/lib/http";
import { deadlineSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Set or clear the deadline. Body: { deadlineAt: ISO-8601 with offset | null } */
export async function PATCH(req: Request): Promise<Response> {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const parsed = deadlineSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(422, "validation");
  const db = getDb();
  const poll = await ensurePoll(db);
  const updated = await setDeadline(db, poll.id, parsed.data.deadlineAt);
  return json({ deadlineAt: updated.deadlineAt, closed: updated.closed });
}
