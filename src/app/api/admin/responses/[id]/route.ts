import { getDb } from "@/lib/db";
import { deleteResponse, ensurePoll } from "@/lib/repo";
import { errorJson, json, requireAdmin } from "@/lib/http";
import { uuidSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) return errorJson(400, "invalid_id");
  const db = getDb();
  const poll = await ensurePoll(db);
  const deleted = await deleteResponse(db, poll.id, id.data);
  return deleted ? json({ ok: true }) : errorJson(404, "not_found");
}
