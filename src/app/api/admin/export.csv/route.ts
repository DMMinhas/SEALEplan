import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/http";
import { applyFilter, ensurePoll, listResponses } from "@/lib/repo";
import { filterFromUrl, responsesToCsv } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const db = getDb();
  const poll = await ensurePoll(db);
  const rows = applyFilter(await listResponses(db, poll.id), filterFromUrl(new URL(req.url)));
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(responsesToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seale-availability-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
