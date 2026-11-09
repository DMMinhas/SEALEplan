import { getDb } from "@/lib/db";
import { ensurePoll } from "@/lib/repo";
import { json } from "@/lib/http";
import { pollConfig } from "@/config/poll.config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const poll = await ensurePoll(getDb());
  return json({
    title: pollConfig.title,
    subtitle: pollConfig.subtitle,
    referenceTimeZone: pollConfig.referenceTimeZone,
    grid: pollConfig.grid,
    deadlineAt: poll.deadlineAt,
    closed: poll.closed,
  });
}
