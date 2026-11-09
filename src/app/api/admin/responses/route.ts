import { getDb } from "@/lib/db";
import { json, requireAdmin } from "@/lib/http";
import { buildAdminData, filterFromUrl } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return json(await buildAdminData(getDb(), filterFromUrl(new URL(req.url))));
}
