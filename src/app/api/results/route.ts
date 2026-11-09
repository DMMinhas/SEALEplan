import { getDb } from "@/lib/db";
import { json } from "@/lib/http";
import { buildPublicResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return json(await buildPublicResults(getDb()));
}
